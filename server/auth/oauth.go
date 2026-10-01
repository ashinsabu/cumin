package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	applogger "github.com/ashinsabu/cumin/server/logger"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type OAuthConfig struct {
	ClientID       string
	ClientSecret   string
	RedirectURL    string
	AllowedOrigins []string
	JWTSecret      string
}

type GoogleUserInfo struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type Handler struct {
	oauth     *oauth2.Config
	repo      *Repo
	cfg       OAuthConfig
	provision func(ctx context.Context, userID string) error
}

func NewHandler(cfg OAuthConfig, repo *Repo, provision func(ctx context.Context, userID string) error) *Handler {
	return &Handler{
		oauth: &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
		repo:      repo,
		cfg:       cfg,
		provision: provision,
	}
}

func (h *Handler) frontendURL() string {
	if len(h.cfg.AllowedOrigins) > 0 {
		return h.cfg.AllowedOrigins[0]
	}
	return ""
}

func (h *Handler) authError(w http.ResponseWriter, r *http.Request, reason string) {
	applogger.FromContext(r.Context()).Warn("auth: login failed",
		slog.String("reason", reason),
		slog.String("ip", r.RemoteAddr),
	)
	http.Redirect(w, r, h.frontendURL()+"/auth-error?reason="+url.QueryEscape(reason), http.StatusTemporaryRedirect)
}

func (h *Handler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		applogger.FromContext(r.Context()).Error("auth: failed to generate state", slog.Any("err", err))
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	state := base64.URLEncoding.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   300,
	})
	authURL := h.oauth.AuthCodeURL(state, oauth2.AccessTypeOffline)
	http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
}

func (h *Handler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	l := applogger.FromContext(r.Context())

	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || r.URL.Query().Get("state") != stateCookie.Value {
		h.authError(w, r, "invalid_state")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "oauth_state", Value: "", Path: "/", MaxAge: -1})

	code := r.URL.Query().Get("code")
	if code == "" {
		h.authError(w, r, "missing_code")
		return
	}

	token, err := h.oauth.Exchange(r.Context(), code)
	if err != nil {
		l.Error("auth: token exchange failed", slog.Any("err", err))
		h.authError(w, r, "token_exchange_failed")
		return
	}

	userInfo, err := fetchGoogleUserInfo(r.Context(), token.AccessToken)
	if err != nil {
		l.Error("auth: google userinfo failed", slog.Any("err", err))
		h.authError(w, r, "server_error")
		return
	}

	isNew, err := h.repo.IsNewUser(r.Context(), userInfo.Sub)
	if err != nil {
		l.Error("auth: IsNewUser failed", slog.String("email", userInfo.Email), slog.Any("err", err))
		h.authError(w, r, "server_error")
		return
	}

	user, err := h.repo.UpsertUser(r.Context(), userInfo.Sub, userInfo.Email, userInfo.Name, userInfo.Picture)
	if err != nil {
		l.Error("auth: UpsertUser failed", slog.String("email", userInfo.Email), slog.Any("err", err))
		h.authError(w, r, "server_error")
		return
	}

	if isNew && h.provision != nil {
		if err := h.provision(r.Context(), user.ID); err != nil {
			l.Error("auth: provision failed", slog.String("user_id", user.ID), slog.Any("err", err))
			h.authError(w, r, "server_error")
			return
		}
	}

	jwtToken, err := IssueToken(h.cfg.JWTSecret, user.ID, user.Email)
	if err != nil {
		l.Error("auth: JWT issue failed", slog.String("user_id", user.ID), slog.Any("err", err))
		h.authError(w, r, "server_error")
		return
	}

	l.Info("auth: login success",
		slog.String("email", userInfo.Email),
		slog.String("user_id", user.ID),
		slog.Bool("new_user", isNew),
	)

	secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    jwtToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		MaxAge:   int(24 * time.Hour / time.Second),
	})

	http.Redirect(w, r, h.frontendURL(), http.StatusTemporaryRedirect)
}

func (h *Handler) HandleMe(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	user, err := h.repo.GetUserByID(r.Context(), userID)
	if err != nil {
		applogger.FromContext(r.Context()).Error("auth: GetUserByID failed",
			slog.String("user_id", userID), slog.Any("err", err))
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *Handler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"logged out"}`))
}

func fetchGoogleUserInfo(ctx context.Context, accessToken string) (*GoogleUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google userinfo returned %d", resp.StatusCode)
	}

	var info GoogleUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	return &info, nil
}
