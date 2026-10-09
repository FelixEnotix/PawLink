package main

// PawLink: a device whose clock is behind cannot finish the WireGuard handshake with a server it
// already used: the server drops an initiation whose timestamp is not later than the last accepted
// one (found 09.10.2026: a PC with the clock a day behind got a working call tunnel, but not a single
// byte went through it). The real time is taken from the Date header of the VK answers the client
// receives anyway (TLS-verified, reachable in whitelist-only networks), and handshake timestamps use
// it whenever the system clock is clearly behind.

import (
	"log"
	"net/http"
	"sync"
	"time"

	"golang.zx2c4.com/wireguard/tai64n"
)

const clockBehindThreshold = 30 * time.Second

var clockSkewMu sync.Mutex

func noteServerDate(value string) {
	if value == "" {
		return
	}
	date, err := http.ParseTime(value)
	if err != nil {
		return
	}
	// The header has a one-second resolution and arrives after the request: a skew below the
	// threshold is noise, not a wrong clock.
	behind := time.Until(date)
	clockSkewMu.Lock()
	defer clockSkewMu.Unlock()
	previous := tai64n.ClockAhead()
	if behind < clockBehindThreshold {
		if previous != 0 && behind < clockBehindThreshold/2 {
			tai64n.SetClockAhead(0)
			log.Printf("[TIME] Часы устройства снова верные; поправка снята")
		}
		return
	}
	if previous == 0 || absDuration(behind-previous) > 5*time.Second {
		tai64n.SetClockAhead(behind)
		log.Printf("[TIME] Часы устройства отстают на %v: для рукопожатия WireGuard используется время VK", behind.Truncate(time.Second))
	}
}

func absDuration(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}
