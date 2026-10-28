package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/httprate"

	applogger "github.com/ashinsabu/cumin/server/logger"
)

const (
	// AccessTokenTTL is how long a stolen access token stays usable after its login is revoked.
	AccessTokenTTL = 15 * time.Minute

	refreshCookieName = "refresh"
	// refreshCookiePath keeps the long-lived cookie off every other API request.
	refreshCookiePath = "/api/auth"
	// csrfHeader must be present on cookie-authenticated calls. A cross-site form or <img> cannot set
	// custom headers, and a cross-origin fetch that does triggers a CORS preflight we only approve
	// for allowed origins.
	csrfHeader      = "X-Requested-With"
	csrfHeaderValue = "cumin"
)

// authResponse is what every login/refresh returns. RefreshToken is only set for native clients,
// which cannot use the httpOnly cookie; browsers get the cookie instead.
type authResponse struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	User         *User  `json:"user,omitempty"`
}

func (h *Handler) newAccessToken(user *User) (string, error) {
	return IssueToken(h.cfg.JWTSecret, user.ID, user.Email, AccessTokenTTL)
}

func (h *Handler) authResponse(user *User, refreshForBody string) (*authResponse, error) {
	access, err := h.newAccessToken(user)
	if err != nil {
		return nil, err
	}
	return &authResponse{AccessToken: access, ExpiresIn: int(AccessTokenTTL.Seconds()), RefreshToken: refreshForBody, User: user}, nil
}

// startWebLogin begins a new login family, sets the refresh cookie and returns the access token.
func (h *Handler) startWebLogin(w http.ResponseWriter, r *http.Request, user *User) (*authResponse, error) {
	refresh, err := h.repo.CreateRefreshFamily(r.Context(), user.ID, h.cfg.Refresh)
	if err != nil {
		return nil, err
	}
	h.setRefreshCookie(w, refresh)
	return h.authResponse(user, "")
}

// startNativeLogin is startWebLogin for clients that keep the refresh token themselves.
func (h *Handler) startNativeLogin(ctx context.Context, user *User) (*authResponse, error) {
	refresh, err := h.repo.CreateRefreshFamily(ctx, user.ID, h.cfg.Refresh)
	if err != nil {
		return nil, err
	}
	return h.authResponse(user, refresh)
}

func (h *Handler) setRefreshCookie(w http.ResponseWriter, value string) {
	policy := h.cfg.Refresh.withDefaults()
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    value,
		Path:     refreshCookiePath,
		MaxAge:   int(policy.Idle.Seconds()),
		HttpOnly: true,
		Secure:   h.cfg.SecureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: refreshCookieName, Path: refreshCookiePath, MaxAge: -1,
		HttpOnly: true, Secure: h.cfg.SecureCookies, SameSite: http.SameSiteLaxMode,
	})
}

// SessionRoutes registers refresh and logout. They are public (the access token may have expired)
// and authenticate by presenting the refresh token.
func (h *Handler) SessionRoutes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(httprate.LimitBy(300, time.Minute, func(r *http.Request) (string, error) { return clientIP(r), nil }))
		r.Post("/api/auth/refresh", h.HandleRefresh)
		r.Post("/api/auth/logout", h.HandleLogout)
	})
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// presentedRefresh finds the refresh token on the request. The cookie (browser) wins; native apps
// send it in the body. Only cookie-borne requests need the CSRF check: a body-borne token cannot be
// attached by a cross-site attacker, who would need the token itself.
func presentedRefresh(w http.ResponseWriter, r *http.Request) (token string, fromCookie bool) {
	if c, err := r.Cookie(refreshCookieName); err == nil && c.Value != "" {
		return c.Value, true
	}
	var req refreshRequest
	json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req) // empty/invalid body = no token
	return req.RefreshToken, false
}

func (h *Handler) passesCSRF(r *http.Request) bool {
	if r.Header.Get(csrfHeader) != csrfHeaderValue {
		return false
	}
	origin := r.Header.Get("Origin")
	return origin == "" || slices.Contains(h.cfg.AllowedOrigins, origin)
}

// HandleRefresh rotates the refresh token and returns a new access token. Only a token that is
// definitively bad ends the login (401 + cookie cleared); a transient failure answers 5xx and leaves
// the cookie alone so a database blip does not log everyone out.
func (h *Handler) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	token, fromCookie := presentedRefresh(w, r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "no refresh token")
		return
	}
	if fromCookie && !h.passesCSRF(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	ctx := r.Context()
	l := applogger.FromContext(ctx)

	userID, next, err := h.repo.RotateRefresh(ctx, token, h.cfg.Refresh)
	switch {
	case errors.Is(err, ErrRefreshInvalid), errors.Is(err, ErrRefreshReused):
		if errors.Is(err, ErrRefreshReused) {
			l.Warn("auth: refresh token reuse, login revoked", slog.String("ip", clientIP(r)))
		}
		if fromCookie {
			h.clearRefreshCookie(w)
		}
		writeError(w, http.StatusUnauthorized, "session expired")
		return
	case err != nil:
		l.Error("auth: refresh failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	user, err := h.repo.GetUserByID(ctx, userID)
	if err != nil {
		l.Error("auth: refresh user lookup failed", slog.String("user_id", userID), slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	body := ""
	if fromCookie {
		h.setRefreshCookie(w, next)
	} else {
		body = next
	}
	resp, err := h.authResponse(user, body)
	if err != nil {
		l.Error("auth: issue access token failed", slog.String("user_id", userID), slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// HandleLogout revokes the login the presented refresh token belongs to. Idempotent: no token or an
// unknown one still answers 200 and clears the cookie.
func (h *Handler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	token, fromCookie := presentedRefresh(w, r)
	if fromCookie && !h.passesCSRF(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	if token != "" {
		if err := h.repo.RevokeRefreshFamily(r.Context(), token); err != nil {
			applogger.FromContext(r.Context()).Error("auth: logout revoke failed", slog.Any("err", err))
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}
	h.clearRefreshCookie(w)
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}
