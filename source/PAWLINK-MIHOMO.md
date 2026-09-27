# mihomo v1.19.30 (PawLink patch)

Copy of `github.com/metacubex/mihomo@v1.19.30` with four changes.

1. `tunnel/connection.go`:
UDP destination-NAT restore uses the destination the application sent to most recently
instead of the first one. Without it a game that talked to a server by hostname (fake-ip)
and then by its real IP from the same socket received replies from the fake-ip address
(CS2: "Sending connect packet to unexpected address 198.18.x.x"). Test: `tunnel/pawlink_nat_test.go`.

2. `adapter/adapter.go` (URLTest with unified delay): when the second, timed request fails, the
   first measurement is returned instead of the whole elapsed time, and the second request is capped
   (3x the first, at least 3 s). Before, a stalled keep-alive reported the probe timeout (8000 ms) as the delay.

3. `adapter/adapter.go`: `WithColdOnlyFlag(ctx, *bool)` - URLTest sets the flag when the warm request
   failed and the value is the cold setup time. PawLink's `native/ping` then prefers warm samples
   (a cold value looked like a 500-1000 ms ping). Callers that do not set the flag are unaffected.

4. `hub/route/cache.go`: `POST /cache/dns/flush` also resets pooled DNS connections of all resolvers.
   The Windows backend calls it after the PC wakes up (dead DoH connections made every server with a
   domain name "unreachable" and auto-select jumped to a server reachable by IP).

Used by the Android core (`native/go.mod` replace) and by `scripts/build-mihomo.ps1` for Windows.
