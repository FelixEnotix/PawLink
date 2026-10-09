package dialer

// PawLink: skip server addresses that accept a TCP connection but never answer after it.
//
// A provider publishes several A records for one server name, and a part of those addresses is
// filtered on the way to them: the SYN is answered, the first data packet (the TLS ClientHello) is
// not. The dialer picks an address by the TCP connection alone (the first one to connect with
// tcp-concurrent, the first one of the DNS answer without it), so such an address kept being
// chosen and every connection through it waited the whole dial timeout and failed. Measured on a
// live subscription: one silent address of four took 28-37 % of all new connections with
// tcp-concurrent, 4 % (in bursts) without it.
//
// The outbound reports the result of the handshake that follows the TCP connection
// (ReportHandshake). An address that stayed silent twice in a row is left out of the following
// dials for a while (10 minutes, then 30, 90, and 4 hours at most) as long as the name has another
// address. A handshake that completes clears the address. When every address of a name is set
// aside they are all used again: nothing is ever made unreachable by this list. The list is kept
// in a file next to the config, so a restart of the core does not start the learning over.

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/netip"
	"os"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/metacubex/mihomo/log"
)

const (
	// Silent handshakes in a row (no completed one in between) before an address is set aside
	// for the first time: one timeout also happens to a working address on a lossy line.
	silentAddrStrikes = 2
	// The first strike is forgotten when the second one does not follow within this time.
	silentAddrStrikeWindow = 10 * time.Minute
	// A record that was not hit again for this long is forgotten (the terms start over).
	silentAddrForget = 24 * time.Hour
	silentAddrLimit  = 1024
	silentAddrSave   = 2 * time.Second
)

// Terms an address is set aside for: first, second, ... time in a row.
var silentAddrTerms = []time.Duration{10 * time.Minute, 30 * time.Minute, 90 * time.Minute, 4 * time.Hour}

type silentAddr struct {
	until   time.Time // skipped until this moment
	terms   int       // how many times in a row it was set aside
	pending int       // silent handshakes since the last term or success
	last    time.Time // last silent handshake
}

// SilentAddress is one entry of the list (diagnostics and the saved file).
type SilentAddress struct {
	Address string `json:"address"`
	Until   int64  `json:"until"`
	Terms   int    `json:"terms"`
	Last    int64  `json:"last"`
	Active  bool   `json:"active"`
}

var (
	silentAddrMu    sync.Mutex
	silentAddrs     = map[netip.AddrPort]*silentAddr{}
	silentAddrCount atomic.Int32 // entries that may filter; read without the lock on every dial
	silentAddrNow   = time.Now   // replaced in tests
	silentAddrFile  string
	silentAddrTimer *time.Timer
)

func handshakeAddr(conn net.Conn) (netip.AddrPort, bool) {
	if conn == nil {
		return netip.AddrPort{}, false
	}
	tcp, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok || tcp == nil {
		return netip.AddrPort{}, false
	}
	addr := tcp.AddrPort()
	if !addr.IsValid() {
		return netip.AddrPort{}, false
	}
	return netip.AddrPortFrom(addr.Addr().Unmap(), addr.Port()), true
}

// silentFailure tells a server that said nothing (timeout, closed or reset connection) from a
// server that answered with a refusal (TLS alert, wrong certificate, failed authentication):
// only the first kind depends on the address.
func silentFailure(err error) bool {
	if errors.Is(err, context.Canceled) {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, os.ErrDeadlineExceeded) ||
		errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) ||
		errors.Is(err, syscall.ECONNRESET) || errors.Is(err, syscall.ECONNABORTED) || errors.Is(err, net.ErrClosed) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func silentTerm(terms int) time.Duration {
	if terms < 1 {
		terms = 1
	}
	if terms > len(silentAddrTerms) {
		terms = len(silentAddrTerms)
	}
	return silentAddrTerms[terms-1]
}

// ReportHandshake records the result of the handshake made right after the TCP connection conn
// was established. A nil error clears the address; silent failures set it aside.
func ReportHandshake(ctx context.Context, conn net.Conn, err error) {
	if err == nil && silentAddrCount.Load() == 0 {
		return
	}
	addr, ok := handshakeAddr(conn)
	if !ok {
		return
	}
	if err == nil {
		silentAddrMu.Lock()
		entry, exist := silentAddrs[addr]
		if exist {
			delete(silentAddrs, addr)
			silentAddrCount.Store(int32(len(silentAddrs)))
			if entry.terms > 0 {
				scheduleSilentSaveLocked()
			}
		}
		silentAddrMu.Unlock()
		if exist && entry.terms > 0 {
			log.Infoln("[Dialer] %s answers again", addr)
		}
		return
	}
	// The application gave up first: says nothing about the server.
	if ctx != nil && errors.Is(ctx.Err(), context.Canceled) {
		return
	}
	if !silentFailure(err) {
		return
	}
	now := silentAddrNow()
	silentAddrMu.Lock()
	entry := silentAddrs[addr]
	if entry == nil {
		if len(silentAddrs) >= silentAddrLimit {
			pruneSilentAddrsLocked(now)
		}
		entry = &silentAddr{}
		silentAddrs[addr] = entry
		silentAddrCount.Store(int32(len(silentAddrs)))
	} else if now.Sub(entry.last) > silentAddrForget {
		*entry = silentAddr{}
	}
	if now.Before(entry.until) {
		// Already set aside (reached while every address of the name was): the term stays.
		entry.last = now
		silentAddrMu.Unlock()
		return
	}
	if entry.terms == 0 {
		if entry.pending > 0 && now.Sub(entry.last) > silentAddrStrikeWindow {
			entry.pending = 0
		}
		entry.pending++
		entry.last = now
		if entry.pending < silentAddrStrikes {
			silentAddrMu.Unlock()
			return
		}
	}
	entry.terms++
	entry.pending = 0
	entry.last = now
	skip := silentTerm(entry.terms)
	entry.until = now.Add(skip)
	scheduleSilentSaveLocked()
	silentAddrMu.Unlock()
	log.Warnln("[Dialer] %s accepts connections but does not answer: skipped for %s while the server has another address", addr, skip)
}

func pruneSilentAddrsLocked(now time.Time) {
	for addr, entry := range silentAddrs {
		if now.Sub(entry.last) > silentAddrForget {
			delete(silentAddrs, addr)
		}
	}
	if len(silentAddrs) >= silentAddrLimit {
		// Still full: drop the quarter whose terms end first.
		type item struct {
			addr  netip.AddrPort
			until time.Time
		}
		items := make([]item, 0, len(silentAddrs))
		for addr, entry := range silentAddrs {
			items = append(items, item{addr, entry.until})
		}
		sort.Slice(items, func(i, j int) bool { return items[i].until.Before(items[j].until) })
		for _, it := range items[:len(items)/4+1] {
			delete(silentAddrs, it.addr)
		}
	}
	silentAddrCount.Store(int32(len(silentAddrs)))
}

// answeringAddrs returns ips without the addresses that are set aside for this port. The input
// is returned unchanged when there is nothing to choose from: one address, none set aside, or all.
func answeringAddrs(ips []netip.Addr, port string) []netip.Addr {
	if len(ips) < 2 || silentAddrCount.Load() == 0 {
		return ips
	}
	portNum, err := strconv.ParseUint(port, 10, 16)
	if err != nil {
		return ips
	}
	now := silentAddrNow()
	var kept []netip.Addr
	silentAddrMu.Lock()
	for i, ip := range ips {
		entry := silentAddrs[netip.AddrPortFrom(ip.Unmap(), uint16(portNum))]
		if entry != nil && now.Before(entry.until) {
			if kept == nil {
				kept = make([]netip.Addr, i, len(ips))
				copy(kept, ips[:i])
			}
			continue
		}
		if kept != nil {
			kept = append(kept, ip)
		}
	}
	silentAddrMu.Unlock()
	if len(kept) == 0 {
		return ips
	}
	return kept
}

func silentAddressesLocked(now time.Time) []SilentAddress {
	out := make([]SilentAddress, 0, len(silentAddrs))
	for addr, entry := range silentAddrs {
		if entry.terms == 0 {
			continue // a single strike is not a verdict
		}
		out = append(out, SilentAddress{Address: addr.String(), Until: entry.until.Unix(), Terms: entry.terms, Last: entry.last.Unix(), Active: now.Before(entry.until)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Address < out[j].Address })
	return out
}

// SilentAddresses lists the addresses that were set aside (those still skipped have Active set).
func SilentAddresses() []SilentAddress {
	now := silentAddrNow()
	silentAddrMu.Lock()
	defer silentAddrMu.Unlock()
	return silentAddressesLocked(now)
}

// ResetSilentAddresses forgets every recorded address.
func ResetSilentAddresses() {
	silentAddrMu.Lock()
	silentAddrs = map[netip.AddrPort]*silentAddr{}
	silentAddrCount.Store(0)
	scheduleSilentSaveLocked()
	silentAddrMu.Unlock()
}

// UseSilentAddressFile sets the file the list is kept in and loads it (once per path).
func UseSilentAddressFile(path string) {
	silentAddrMu.Lock()
	defer silentAddrMu.Unlock()
	if path == "" || path == silentAddrFile {
		return
	}
	silentAddrFile = path
	data, err := os.ReadFile(path)
	if err != nil || len(data) > 1<<20 {
		return
	}
	var saved []SilentAddress
	if json.Unmarshal(data, &saved) != nil {
		return
	}
	now := silentAddrNow()
	for _, item := range saved {
		addr, err := netip.ParseAddrPort(item.Address)
		last := time.Unix(item.Last, 0)
		until := time.Unix(item.Until, 0)
		// A clock set back must not keep an address aside longer than the longest term.
		if err != nil || item.Terms < 1 || now.Sub(last) > silentAddrForget || last.After(now.Add(time.Minute)) ||
			until.After(now.Add(silentAddrTerms[len(silentAddrTerms)-1])) || len(silentAddrs) >= silentAddrLimit {
			continue
		}
		if _, exist := silentAddrs[addr]; !exist {
			silentAddrs[addr] = &silentAddr{until: until, terms: item.Terms, last: last}
		}
	}
	silentAddrCount.Store(int32(len(silentAddrs)))
}

func scheduleSilentSaveLocked() {
	if silentAddrFile == "" || silentAddrTimer != nil {
		return
	}
	silentAddrTimer = time.AfterFunc(silentAddrSave, saveSilentAddrs)
}

func saveSilentAddrs() {
	silentAddrMu.Lock()
	silentAddrTimer = nil
	path := silentAddrFile
	list := silentAddressesLocked(silentAddrNow())
	silentAddrMu.Unlock()
	if path == "" {
		return
	}
	data, err := json.Marshal(list)
	if err != nil {
		return
	}
	tmp := path + ".tmp"
	if os.WriteFile(tmp, data, 0o600) != nil {
		return
	}
	if os.Rename(tmp, path) != nil {
		_ = os.Remove(tmp)
	}
}
