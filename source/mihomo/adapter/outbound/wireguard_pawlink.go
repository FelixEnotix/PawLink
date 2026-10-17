package outbound

// PawLink: change of the UDP source port when the WireGuard server stops answering.
//
// On networks with DPI (AmneziaWG / WARP in Russia) a single UDP flow (source port) can be
// dropped for good while a new flow from another port goes through at once: measured on
// WARP, every handshake from a "dead" port stayed unanswered for minutes (284 s), a new core
// with a new port connected in 5 of 7 tries. The bind keeps one socket for its whole life,
// so the tunnel stayed "connected" with no traffic until the user reconnected.
//
// The guard samples the device counters. When something is being sent, nothing has been
// received for stallAfter (handshake answers count) while more than keepalives went out, and
// there has been no completed handshake for stallAfter, it
// re-opens the bind (BindUpdate): the next handshake goes out from a new port and, as on a
// fresh start, AmneziaWG sends its I1-I5 / junk packets in front of it. A working tunnel
// (anything received, or a fresh handshake) is never touched; an idle one sends nothing.
// The current keys are dropped first, so the new flow starts with the handshake (and the
// AmneziaWG packets before it), not with data packets, exactly like a fresh connection. The guard
// does not start a handshake itself: the next packet the user sends does, so a dead server nobody
// uses (Windows keeps every server of the subscriptions in the config) is not knocked at forever.

import (
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/metacubex/mihomo/log"

	amneziav3 "github.com/metacubex/amneziawg-go/device"
	amnezia "github.com/metacubex/amneziawg-go/device_v1"
	"github.com/metacubex/wireguard-go/device"
)

const (
	wgStallCheckEvery = 5 * time.Second
	wgStallAfter      = 20 * time.Second
	wgStallCooldown   = 15 * time.Second
	// More than keepalives (32 bytes every persistent-keepalive interval) and less than
	// three unanswered handshake initiations (148 bytes each, more with AmneziaWG junk).
	wgStallMinSent = 400
)

type wgStallGuard struct {
	once sync.Once
	stop chan struct{}
}

type wgCounters struct {
	tx, rx        uint64
	lastHandshake time.Time // zero = never
}

func parseWgCounters(ipc string) (c wgCounters) {
	var sec, nsec int64
	for _, line := range strings.Split(ipc, "\n") {
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch key {
		case "public_key":
			if sec > 0 {
				if t := time.Unix(sec, nsec); t.After(c.lastHandshake) {
					c.lastHandshake = t
				}
			}
			sec, nsec = 0, 0
		case "tx_bytes":
			n, _ := strconv.ParseUint(value, 10, 64)
			c.tx += n
		case "rx_bytes":
			n, _ := strconv.ParseUint(value, 10, 64)
			c.rx += n
		case "last_handshake_time_sec":
			sec, _ = strconv.ParseInt(value, 10, 64)
		case "last_handshake_time_nsec":
			nsec, _ = strconv.ParseInt(value, 10, 64)
		}
	}
	if sec > 0 {
		if t := time.Unix(sec, nsec); t.After(c.lastHandshake) {
			c.lastHandshake = t
		}
	}
	return
}

// wgStallState decides on samples; separated from the timer for tests.
type wgStallState struct {
	last      wgCounters
	rxAt      time.Time // when rx last grew (or the guard started / the bind was re-opened)
	txAtRx    uint64    // tx when rx last grew
	rotatedAt time.Time
}

func (s *wgStallState) observe(now time.Time, c wgCounters) (rotate bool) {
	if s.rxAt.IsZero() || c.rx != s.last.rx || c.tx < s.last.tx {
		s.rxAt, s.txAtRx = now, c.tx
	}
	s.last = c
	if c.tx < s.txAtRx+wgStallMinSent || now.Sub(s.rxAt) < wgStallAfter {
		return false
	}
	if !c.lastHandshake.IsZero() && now.Sub(c.lastHandshake) < wgStallAfter {
		return false
	}
	if !s.rotatedAt.IsZero() && now.Sub(s.rotatedAt) < wgStallCooldown {
		return false
	}
	s.rotatedAt = now
	s.rxAt, s.txAtRx = now, c.tx
	return true
}

// startStallGuard is called from init0 with initMutex held.
func (w *WireGuard) startStallGuard() {
	guard := &wgStallGuard{stop: make(chan struct{})}
	w.stallGuard = guard
	go func() {
		ticker := time.NewTicker(wgStallCheckEvery)
		defer ticker.Stop()
		var state wgStallState
		for {
			select {
			case <-guard.stop:
				return
			case now := <-ticker.C:
				ipc, err := w.device.IpcGet()
				if err != nil {
					continue
				}
				if state.observe(now, parseWgCounters(ipc)) {
					log.Warnln("[WG](%s) no answer from the server, reopening UDP socket (new source port)", w.option.Name)
					w.forEachPeer(func(expire func()) { expire() })
					if err := w.device.BindUpdate(); err != nil {
						log.Warnln("[WG](%s) reopen UDP socket: %s", w.option.Name, err)
					}
				}
			}
		}
	}()
}

func (w *WireGuard) stopStallGuard() {
	w.initMutex.Lock()
	guard := w.stallGuard
	w.initMutex.Unlock()
	if guard != nil {
		guard.once.Do(func() { close(guard.stop) })
	}
}

// forEachPeer gives the configured peers of any of the three device implementations.
func (w *WireGuard) forEachPeer(fn func(expire func())) {
	keys := make([]string, 0, 1)
	if len(w.option.Peers) > 0 {
		for _, peer := range w.option.Peers {
			keys = append(keys, peer.PublicKey)
		}
	} else {
		keys = append(keys, w.option.PublicKey)
	}
	for _, key := range keys { // hex, converted in NewWireGuard
		switch d := w.device.(type) {
		case *device.Device:
			var pk device.NoisePublicKey
			if pk.FromHex(key) == nil {
				if peer := d.LookupPeer(pk); peer != nil {
					fn(peer.ExpireCurrentKeypairs)
				}
			}
		case *amnezia.Device:
			var pk amnezia.NoisePublicKey
			if pk.FromHex(key) == nil {
				if peer := d.LookupPeer(pk); peer != nil {
					fn(peer.ExpireCurrentKeypairs)
				}
			}
		case *amneziav3.Device:
			var pk amneziav3.NoisePublicKey
			if pk.FromHex(key) == nil {
				if peer := d.LookupPeer(pk); peer != nil {
					fn(peer.ExpireCurrentKeypairs)
				}
			}
		}
	}
}
