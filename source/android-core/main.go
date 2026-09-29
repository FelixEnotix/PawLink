package main

/*
#include <stdlib.h>
*/
import "C"
import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/metacubex/mihomo/adapter"
	"github.com/metacubex/mihomo/component/resolver"
	_ "github.com/metacubex/mihomo/component/geodata/memconservative"
	_ "github.com/metacubex/mihomo/component/geodata/standard"
	"github.com/metacubex/mihomo/config"
	mihomodns "github.com/metacubex/mihomo/dns"
	MC "github.com/metacubex/mihomo/constant"
	"github.com/metacubex/mihomo/hub/executor"
	"github.com/metacubex/mihomo/listener/sing_tun"
	"github.com/metacubex/mihomo/tunnel"
	"github.com/metacubex/mihomo/tunnel/statistic"
	"net"
	"os"
	"pawlink/androidcore/ping"
	"runtime"
	"runtime/pprof"
	"strings"
	"sync"
	"syscall"
	"time"
)

var coreMutex sync.Mutex
var activeProbeMutex sync.Mutex
var runningTun *sing_tun.Listener

//export PawStart
func PawStart(home *C.char, payload *C.char) (result *C.char) {
	coreMutex.Lock()
	defer coreMutex.Unlock()
	defer func() {
		if r := recover(); r != nil {
			result = C.CString(fmt.Sprint(r))
		}
	}()
	dir := C.GoString(home)
	MC.SetHomeDir(dir)
	os.Chdir(dir)
	cfg, err := config.Parse([]byte(C.GoString(payload)))
	if err != nil {
		return C.CString(err.Error())
	}
	options := cfg.General.Tun
	cfg.General.Tun.Enable = false
	executor.ApplyConfig(cfg, true)
	if options.Enable {
		owned, dupErr := syscall.Dup(options.FileDescriptor)
		if dupErr != nil {
			return C.CString(dupErr.Error())
		}
		options.FileDescriptor = owned
		runningTun, err = sing_tun.New(options, tunnel.Tunnel)
		if err != nil {

			syscall.Close(owned)
			runningTun = nil
			return C.CString(err.Error())
		}
	}
	return C.CString("")
}

//export PawStop
func PawStop() {
	coreMutex.Lock()
	defer coreMutex.Unlock()
	if runningTun != nil {
		runningTun.Close()
		runningTun = nil
	}
	statistic.DefaultManager.Range(func(c statistic.Tracker) bool { c.Close(); return true })
	executor.Shutdown()
	tunnel.OnSuspend()
}

//export PawProbe
func PawProbe(payload *C.char) (result C.int) {
	result = -1
	defer func() {
		if recover() != nil {
			result = -1
		}
	}()
	var mapping map[string]any
	if json.Unmarshal([]byte(C.GoString(payload)), &mapping) != nil {
		return -1
	}
	var proxy MC.Proxy
	activeCoreProbe, _ := mapping["_pawlink_active_core_probe"].(bool)
	if activeCoreProbe {
		activeProbeMutex.Lock()
		defer activeProbeMutex.Unlock()
		coreMutex.Lock()
		proxy = tunnel.Proxies()["PawLink"]
		coreMutex.Unlock()
		if proxy == nil {
			return -1
		}
	} else {

		options := make(map[string]any, len(mapping))
		for key, value := range mapping {
			if !strings.HasPrefix(key, "_") {
				options[key] = value
			}
		}
		parsed, err := adapter.ParseProxy(options)

		if checkOnly, _ := mapping["_pawlink_check_only"].(bool); checkOnly {
			if err != nil {
				return -3
			}
			parsed.Close()
			return 0
		}
		if err != nil {
			return -1
		}
		proxy = parsed
		defer proxy.Close()
	}
	samples := 1
	if value, ok := mapping["_pawlink_probe_samples"].(float64); ok {
		samples = int(value)
	}
	if samples < 1 {
		samples = 1
	}
	if samples > len(ping.URLTestTargets) {
		samples = len(ping.URLTestTargets)
	}
	fast, _ := mapping["_pawlink_probe_fast"].(bool)
	timeoutPerSample := ping.ProbeTimeout
	if fast {
		timeoutPerSample = ping.ProbeFastTimeout
	}
	proxyType, _ := mapping["type"].(string)
	wireGuard := strings.Contains(strings.ToLower(proxyType), "wireguard")
	totalTimeout := time.Duration(samples)*timeoutPerSample + 2*time.Second
	if wireGuard {
		totalTimeout += timeoutPerSample
	}

	adapter.UnifiedDelay.Store(true)
	ctx, cancel := context.WithTimeout(context.Background(), totalTimeout)
	defer cancel()
	return C.int(ping.MeasureSamples(ctx, proxy, wireGuard, samples, fast))
}

//export PawResetNetwork
func PawResetNetwork() {

	go func() {
		coreMutex.Lock()
		defer coreMutex.Unlock()
		resolver.ResetConnection()
		for _, r := range []resolver.Resolver{resolver.ProxyServerHostResolver, resolver.DirectHostResolver} {
			if r != nil {
				r.ResetConnection()
			}
		}
	}()
}

//export PawSetSystemDNS
func PawSetSystemDNS(list *C.char) {

	addrs := make([]string, 0, 4)
	for _, ip := range strings.Split(C.GoString(list), ",") {
		if ip = strings.TrimSpace(ip); ip != "" {
			addrs = append(addrs, net.JoinHostPort(ip, "53"))
		}
	}
	mihomodns.UpdateSystemDNS(addrs)
}

//export PawStats
func PawStats() *C.char {
	up, down := statistic.DefaultManager.Now()
	sent, received := statistic.DefaultManager.Total()
	return C.CString(fmt.Sprintf("%d,%d,%d,%d", up, down, sent, received))
}

//export PawDiagnostics
func PawDiagnostics() *C.char {
	runtime.GC()
	entries, _ := os.ReadDir("/proc/self/fd")
	eventFDs, sockets, epolls := 0, 0, 0
	for _, entry := range entries {
		target, err := os.Readlink("/proc/self/fd/" + entry.Name())
		if err != nil {
			continue
		}
		switch {
		case target == "anon_inode:[eventfd]":
			eventFDs++
		case len(target) >= 8 && target[:8] == "socket:[":
			sockets++
		case target == "anon_inode:[eventpoll]":
			epolls++
		}
	}
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	payload, _ := json.Marshal(map[string]uint64{
		"fds": uint64(len(entries)), "eventfds": uint64(eventFDs), "sockets": uint64(sockets),
		"epolls": uint64(epolls), "goroutines": uint64(runtime.NumGoroutine()),
		"heapBytes": memory.HeapAlloc, "heapObjects": memory.HeapObjects,
	})
	return C.CString(string(payload))
}

//export PawDumpStacks
func PawDumpStacks(path *C.char) *C.char {
	file, err := os.Create(C.GoString(path))
	if err == nil {
		err = pprof.Lookup("goroutine").WriteTo(file, 2)
		if closeErr := file.Close(); err == nil {
			err = closeErr
		}
	}
	if err != nil {
		return C.CString(err.Error())
	}
	return C.CString("")
}
func main() {}
