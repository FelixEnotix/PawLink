package ping

import (
	"context"
	"sort"
	"time"

	"github.com/metacubex/mihomo/adapter"
	"github.com/metacubex/mihomo/common/utils"
)

const (
	MinUsefulDelayMS = 5
	ProbeTimeout     = 8 * time.Second
	ProbeFastTimeout = 5 * time.Second
)

var URLTestTargets = []string{
	"https://www.gstatic.com/generate_204",
	"http://www.gstatic.com/generate_204",
	"http://connectivitycheck.gstatic.com/generate_204",
	"http://cp.cloudflare.com/generate_204",
}

const WireGuardFallbackTarget = "https://cp.cloudflare.com/"

type URLTester interface {
	URLTest(context.Context, string, utils.IntRanges[uint16]) (uint16, error)
}

func Measure(ctx context.Context, tester URLTester, wireGuardFallback bool) int {
	return measureTargets(ctx, tester, wireGuardFallback, len(URLTestTargets), false)
}

func MeasureSamples(ctx context.Context, tester URLTester, wireGuardFallback bool, samples int, fast bool) int {
	return measureTargets(ctx, tester, wireGuardFallback, samples, fast)
}

func measureTargets(ctx context.Context, tester URLTester, wireGuardFallback bool, samples int, fast bool) int {
	if samples < 1 {
		samples = 1
	}
	if samples > len(URLTestTargets) {
		samples = len(URLTestTargets)
	}
	timeout := ProbeTimeout
	if fast {
		timeout = ProbeFastTimeout
	}

	delays := make([]int, 0, samples)
	colds := make([]int, 0, samples)
	measure := func(target string) {
		cold := false
		probeCtx, cancel := context.WithTimeout(adapter.WithColdOnlyFlag(ctx, &cold), timeout)
		delay, err := tester.URLTest(probeCtx, target, nil)
		cancel()
		if err != nil || !usableDelay(int(delay), timeout) {
			return
		}
		if cold {
			colds = append(colds, int(delay))
		} else {
			delays = append(delays, int(delay))
		}
	}
	for index := 0; index < samples; index++ {
		if ctx.Err() != nil {
			return -1
		}
		measure(URLTestTargets[index])
	}
	if len(delays) == 0 && len(colds) == 0 && wireGuardFallback && ctx.Err() == nil {
		measure(WireGuardFallbackTarget)
	}
	if len(delays) == 0 {
		delays = colds
	}
	if len(delays) == 0 {
		return -1
	}
	sort.Ints(delays)
	return delays[len(delays)/2]
}

func usableDelay(delay int, timeout time.Duration) bool {
	return delay >= MinUsefulDelayMS && delay < int(timeout/time.Millisecond)-250
}
