package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"slices"

	"github.com/ashinsabu/cumin/server/api"
	applogger "github.com/ashinsabu/cumin/server/logger"
)

// tokenInfoURL is Google's ID token verification endpoint (checks signature and expiry).
// Overridden in tests.
var tokenInfoURL = "https://oauth2.googleapis.com/tokeninfo"

type mobileLoginRequest struct {
	IDToken string `json:"id_token"`
}

type mobileLoginResponse struct {
	Token string `json:"token"`
	User  *User  `json:"user"`
}

// HandleMobileLogin exchanges a Google ID token from a native app (Google Sign-In SDK) for a Cumin JWT.
// Unlike the web callback, the JWT is returned in the body; the app sends it back as `Authorization: Bearer`.
func (h *Handler) HandleMobileLogin(w http.ResponseWriter, r *http.Request) {
	api.Handle(h.mobileLogin)(w, r)
}

func (h *Handler) mobileLogin(ctx context.Context, req mobileLoginRequest) (*mobileLoginResponse, error) {
	l := applogger.FromContext(ctx)

	if len(h.cfg.AppClientIDs) == 0 {
		return nil, api.NotFound("mobile login not configured")
	}
	if req.IDToken == "" {
		return nil, api.BadRequest("id_token is required")
	}

	info, err := verifyGoogleIDToken(ctx, req.IDToken, h.cfg.AppClientIDs)
	if err != nil {
		l.Warn("auth: mobile id token rejected", slog.Any("err", err))
		return nil, &api.Error{Status: http.StatusUnauthorized, Message: "invalid id token"}
	}

	user, isNew, jwtToken, err := h.signIn(ctx, info, MobileTokenTTL)
	if err != nil {
		return nil, api.Internal("internal error")
	}

	l.Info("auth: mobile login success",
		slog.String("email", info.Email),
		slog.String("user_id", user.ID),
		slog.Bool("new_user", isNew),
	)
	return &mobileLoginResponse{Token: jwtToken, User: user}, nil
}

// verifyGoogleIDToken validates the token with Google, then checks it was issued
// for one of our app client IDs and that the email is verified.
func verifyGoogleIDToken(ctx context.Context, rawToken string, audiences []string) (*GoogleUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", tokenInfoURL+"?id_token="+url.QueryEscape(rawToken), nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google tokeninfo returned %d", resp.StatusCode)
	}

	var claims struct {
		Iss           string `json:"iss"`
		Aud           string `json:"aud"`
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified string `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		return nil, err
	}

	if !slices.Contains(audiences, claims.Aud) {
		return nil, fmt.Errorf("unexpected audience %q", claims.Aud)
	}
	if claims.Iss != "accounts.google.com" && claims.Iss != "https://accounts.google.com" {
		return nil, fmt.Errorf("unexpected issuer %q", claims.Iss)
	}
	if claims.EmailVerified != "true" {
		return nil, fmt.Errorf("email not verified")
	}
	return &GoogleUserInfo{Sub: claims.Sub, Email: claims.Email, Name: claims.Name, Picture: claims.Picture}, nil
}
