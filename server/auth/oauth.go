package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type OAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	FrontendURL  string
	JWTSecret    string
}

type GoogleUserInfo struct {
	Sub        string `json:"sub"`
	Email      string `json:"email"`
	Name       string `json:"name"`
	Picture    string `json:"picture"`
}

type Handler struct {
	oauth    *oauth2.Config
	repo     *Repo
	cfg      OAuthConfig
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

func (h *Handler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	state := base64.URLEncoding.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   300,
	})
	url := h.oauth.AuthCodeURL(state, oauth2.AccessTypeOffline)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (h *Handler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || r.URL.Query().Get("state") != stateCookie.Value {
		http.Error(w, `{"error":"invalid state"}`, http.StatusForbidden)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "oauth_state", Value: "", Path: "/", MaxAge: -1})

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing code", http.StatusBadRequest)
		return
	}

	token, err := h.oauth.Exchange(r.Context(), code)
	if err != nil {
		http.Error(w, fmt.Sprintf("token exchange: %v", err), http.StatusInternalServerError)
		return
	}

	userInfo, err := fetchGoogleUserInfo(r.Context(), token.AccessToken)
	if err != nil {
		http.Error(w, fmt.Sprintf("fetch user info: %v", err), http.StatusInternalServerError)
		return
	}

	isNew, err := h.repo.IsNewUser(r.Context(), userInfo.Sub)
	if err != nil {
		http.Error(w, fmt.Sprintf("check user: %v", err), http.StatusInternalServerError)
		return
	}

	user, err := h.repo.UpsertUser(r.Context(), userInfo.Sub, userInfo.Email, userInfo.Name, userInfo.Picture)
	if err != nil {
		http.Error(w, fmt.Sprintf("upsert user: %v", err), http.StatusInternalServerError)
		return
	}

	if isNew && h.provision != nil {
		if err := h.provision(r.Context(), user.ID); err != nil {
			http.Error(w, fmt.Sprintf("provision: %v", err), http.StatusInternalServerError)
			return
		}
	}

	jwtToken, err := IssueToken(h.cfg.JWTSecret, user.ID, user.Email)
	if err != nil {
		http.Error(w, fmt.Sprintf("issue token: %v", err), http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    jwtToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(24 * time.Hour / time.Second),
	})

	http.Redirect(w, r, h.cfg.FrontendURL, http.StatusTemporaryRedirect)
}

func (h *Handler) HandleMe(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	user, err := h.repo.GetUserByID(r.Context(), userID)
	if err != nil {
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
