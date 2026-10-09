package route

import (
	"github.com/metacubex/mihomo/component/dialer"
	"github.com/metacubex/mihomo/component/resolver"

	"github.com/metacubex/chi"
	"github.com/metacubex/chi/render"
	"github.com/metacubex/http"
)

func cacheRouter() http.Handler {
	r := chi.NewRouter()
	r.Post("/fakeip/flush", flushFakeIPPool)
	r.Post("/dns/flush", flushDnsCache)
	// PawLink: server addresses the dialer skips because they accept a connection and stay silent.
	r.Get("/silent-addresses", listSilentAddresses)
	r.Post("/silent-addresses/flush", flushSilentAddresses)
	return r
}

func listSilentAddresses(w http.ResponseWriter, r *http.Request) {
	render.JSON(w, r, render.M{"addresses": dialer.SilentAddresses()})
}

func flushSilentAddresses(w http.ResponseWriter, r *http.Request) {
	dialer.ResetSilentAddresses()
	render.NoContent(w, r)
}

func flushFakeIPPool(w http.ResponseWriter, r *http.Request) {
	err := resolver.FlushFakeIP()
	if err != nil {
		render.Status(r, http.StatusBadRequest)
		render.JSON(w, r, newError(err.Error()))
		return
	}
	render.NoContent(w, r)
}

func flushDnsCache(w http.ResponseWriter, r *http.Request) {
	resolver.ClearCache()
	// PawLink: also drop pooled DoH/DoT connections. After sleep they are dead but
	// still look alive (Go timers stop while the PC sleeps), so server lookups hung.
	resolver.ResetConnection()
	for _, rs := range []resolver.Resolver{resolver.ProxyServerHostResolver, resolver.DirectHostResolver} {
		if rs != nil {
			go rs.ResetConnection()
		}
	}
	render.NoContent(w, r)
}
