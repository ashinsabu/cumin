package auth

import (
	"net"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"
)

// ClientIP resolves the caller's address once per request. trustedProxyHops is how many reverse
// proxies sit in front of this server (0 = clients connect directly). The address is then the
// X-Forwarded-For entry that many hops from the right, which a client cannot forge because each
// trusted proxy appends to the chain; entries further left are ignored.
func ClientIP(trustedProxyHops int) func(http.Handler) http.Handler {
	if trustedProxyHops < 1 {
		return func(next http.Handler) http.Handler { return middleware.ClientIPFromRemoteAddr(next) }
	}
	return middleware.ClientIPFromXFFTrustedProxies(trustedProxyHops)
}

// clientIP returns the address resolved by ClientIP, bucketed by /64 for IPv6 so one host cannot
// dodge limits by rotating addresses. Falls back to the socket address if the proxy header was
// absent, so a misrouted request is still limited (just per proxy) rather than unlimited.
func clientIP(r *http.Request) string {
	if ip := middleware.GetClientIP(r.Context()); ip != "" {
		return httprate.CanonicalizeIP(ip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return httprate.CanonicalizeIP(host)
}
