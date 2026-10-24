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

	"github.com/alexedwards/scs/v2"
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
	// AppClientIDs are the native app OAuth client IDs accepted as ID token audiences.
	AppClientIDs []string
}

type GoogleUserInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

type Handler struct {
	oauth     *oauth2.Config
	repo      *Repo
	cfg       OAuthConfig
	provision func(ctx context.Context, userID, name string) error
	sessions  *scs.SessionManager

	// Email+password auth; nil mailer means the feature is off (see EnablePassword).
	mailer Mailer
	limits *passwordLimits
	// async runs background work (mail sending); tests replace it with a synchronous call.
	async func(func())
}

func NewHandler(cfg OAuthConfig, repo *Repo, sessions *scs.SessionManager, provision func(ctx context.Context, userID, name string) error) *Handler {
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
		sessions:  sessions,
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
	stateSecure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		Secure:   stateSecure,
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

	if !userInfo.EmailVerified {
		h.authError(w, r, "email_not_verified")
		return
	}

	user, err := h.signInGoogle(r.Context(), userInfo)
	if err != nil {
		h.authError(w, r, "server_error")
		return
	}

	if err := h.startSession(r.Context(), user); err != nil {
		l.Error("auth: start session failed", slog.String("user_id", user.ID), slog.Any("err", err))
		h.authError(w, r, "server_error")
		return
	}

	l.Info("auth: login success",
		slog.String("email", userInfo.Email),
		slog.String("user_id", user.ID),
	)
	http.Redirect(w, r, h.frontendURL(), http.StatusTemporaryRedirect)
}

// signInGoogle resolves the Google identity to a user (linking an email-matched password account)
// and provisions defaults on first login. Shared by the web callback and the native mobile login.
func (h *Handler) signInGoogle(ctx context.Context, info *GoogleUserInfo) (*User, error) {
	l := applogger.FromContext(ctx)

	user, err := h.repo.UpsertGoogleUser(ctx, info.Sub, info.Email, info.Name, info.Picture)
	if err != nil {
		l.Error("auth: UpsertGoogleUser failed", slog.String("email", info.Email), slog.Any("err", err))
		return nil, err
	}
	if err := h.ensureProvisioned(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

// ensureProvisioned creates the default project/statuses exactly once per user. The claim is an
// atomic UPDATE, so concurrent first logins cannot both provision; a failed provision releases the
// claim so the next login retries.
func (h *Handler) ensureProvisioned(ctx context.Context, user *User) error {
	l := applogger.FromContext(ctx)

	claimed, err := h.repo.ClaimProvisioning(ctx, user.ID)
	if err != nil {
		l.Error("auth: claim provisioning failed", slog.String("user_id", user.ID), slog.Any("err", err))
		return err
	}
	if !claimed || h.provision == nil {
		return nil
	}
	if err := h.provision(ctx, user.ID, user.DisplayName); err != nil {
		l.Error("auth: provision failed", slog.String("user_id", user.ID), slog.Any("err", err))
		if relErr := h.repo.ReleaseProvisioning(ctx, user.ID); relErr != nil {
			l.Error("auth: release provisioning failed", slog.String("user_id", user.ID), slog.Any("err", relErr))
		}
		return err
	}
	return nil
}

// startSession binds the web session to the user. RenewToken rotates the session ID so a token
// planted before login (session fixation) is useless afterwards.
func (h *Handler) startSession(ctx context.Context, user *User) error {
	if err := h.sessions.RenewToken(ctx); err != nil {
		return err
	}
	h.sessions.Put(ctx, sessionUserKey, user.ID)
	h.sessions.Put(ctx, sessionTouchKey, time.Now().Unix())
	return nil
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
	if err := h.sessions.Destroy(r.Context()); err != nil {
		applogger.FromContext(r.Context()).Error("auth: session destroy failed", slog.Any("err", err))
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
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
