package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/alexedwards/argon2id"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/httprate"
	"github.com/jackc/pgx/v5"

	applogger "github.com/ashinsabu/cumin/server/logger"
)

const (
	minPasswordLen = 10
	maxPasswordLen = 128
	maxEmailLen    = 254
	maxNameLen     = 100

	verifyTokenTTL = 24 * time.Hour
	resetTokenTTL  = time.Hour
)

// OWASP-recommended argon2id minimum: 19 MiB, 2 iterations, 1 lane.
var argonParams = &argon2id.Params{Memory: 19 * 1024, Iterations: 2, Parallelism: 1, SaltLength: 16, KeyLength: 32}

// dummyHash is compared against when the account doesn't exist so that "unknown email" and
// "wrong password" take the same time.
var dummyHash = sync.OnceValue(func() string {
	h, err := argon2id.CreateHash("timing-equalizer-not-a-real-password", argonParams)
	if err != nil {
		panic(err) // only fails if the system RNG is broken
	}
	return h
})

// passwordLimits are per-email limits; they cannot be evaded by spoofing client IP headers.
type passwordLimits struct {
	signup *httprate.RateLimiter
	login  *httprate.RateLimiter
	resend *httprate.RateLimiter
	forgot *httprate.RateLimiter
}

func newPasswordLimits() *passwordLimits {
	return &passwordLimits{
		signup: httprate.NewRateLimiter(5, time.Hour),
		login:  httprate.NewRateLimiter(10, 15*time.Minute),
		resend: httprate.NewRateLimiter(3, time.Hour),
		forgot: httprate.NewRateLimiter(3, time.Hour),
	}
}

// EnablePassword turns on email+password auth. Without a Mailer the feature stays off, since
// verification and reset cannot work and the links must never be logged in production.
func (h *Handler) EnablePassword(m Mailer) {
	h.mailer = m
	h.limits = newPasswordLimits()
	if h.async == nil {
		h.async = func(f func()) { go f() }
	}
}

func (h *Handler) PasswordEnabled() bool { return h.mailer != nil }

// PasswordRoutes registers the password endpoints. A coarse per-IP backstop sits in front of the
// per-email limits (keyed on the address resolved by ClientIP, which only trusts the configured proxy hops).
func (h *Handler) PasswordRoutes(r chi.Router) {
	if !h.PasswordEnabled() {
		return
	}
	r.Group(func(r chi.Router) {
		r.Use(httprate.LimitBy(120, time.Minute, func(r *http.Request) (string, error) { return clientIP(r), nil }))
		r.Post("/api/auth/password/signup", h.HandleSignup)
		r.Post("/api/auth/password/login", h.HandlePasswordLogin)
		r.Post("/api/auth/password/forgot", h.HandleForgot)
		r.Post("/api/auth/password/reset", h.HandleReset)
		r.Post("/api/auth/email/verify", h.HandleVerifyEmail)
		r.Post("/api/auth/email/resend", h.HandleResendVerification)
	})
}

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

var acceptedResponse = map[string]string{"status": "check_email"}

// HandleSignup creates an unverified account and mails a verification link. The response is the
// same whether or not the address is already registered, so it cannot be used to enumerate users.
func (h *Handler) HandleSignup(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	email, err := validateEmail(req.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validatePassword(req.Password); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	name := cleanName(req.Name, email)
	if h.limited(w, r, h.limits.signup, email) {
		return
	}
	ctx := r.Context()
	l := applogger.FromContext(ctx)

	// Hash before the lookup so new, squatted and verified addresses all cost the same.
	hash, err := argon2id.CreateHash(req.Password, argonParams)
	if err != nil {
		l.Error("auth: hash password failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	existing, err := h.repo.GetUserByEmail(ctx, email)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		user, err := h.repo.CreatePasswordUser(ctx, email, hash, name)
		if errors.Is(err, ErrEmailTaken) {
			break // lost a race with a concurrent signup; behave as "already registered"
		}
		if err != nil {
			l.Error("auth: create password user failed", slog.Any("err", err))
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		h.sendVerification(ctx, user)
	case err != nil:
		l.Error("auth: signup lookup failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	case existing.EmailVerifiedAt == nil:
		// Unverified: whoever registered first may be a squatter. The latest signup wins and the
		// old verification link is invalidated by the new token.
		replaced, err := h.repo.OverwriteUnverifiedPassword(ctx, existing.ID, hash, name)
		if err != nil {
			l.Error("auth: overwrite unverified failed", slog.Any("err", err))
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if replaced {
			h.sendVerification(ctx, existing)
		}
	}
	writeJSON(w, http.StatusAccepted, acceptedResponse)
}

// HandlePasswordLogin starts a web session for a verified account.
func (h *Handler) HandlePasswordLogin(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	// Keyed by email: slows guessing against one account regardless of source IP, at the cost that
	// an attacker can lock a victim out of password login for the window (Google login still works).
	if h.limited(w, r, h.limits.login, email) {
		return
	}
	ctx := r.Context()
	l := applogger.FromContext(ctx)

	user, err := h.repo.GetUserByEmail(ctx, email)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		l.Error("auth: login lookup failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	hash := dummyHash()
	known := err == nil && user.PasswordHash != ""
	if known {
		hash = user.PasswordHash
	}
	match, cmpErr := argon2id.ComparePasswordAndHash(req.Password, hash)
	if cmpErr != nil {
		l.Error("auth: password compare failed", slog.Any("err", cmpErr))
	}
	if !known || cmpErr != nil || !match {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	// Only revealed after the password is right, so it doesn't disclose which addresses exist.
	if user.EmailVerifiedAt == nil {
		writeError(w, http.StatusForbidden, "email_not_verified")
		return
	}
	if err := h.ensureProvisioned(ctx, user); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := h.startSession(ctx, user); err != nil {
		l.Error("auth: start session failed", slog.String("user_id", user.ID), slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	l.Info("auth: password login success", slog.String("user_id", user.ID))
	writeJSON(w, http.StatusOK, user)
}

type tokenRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// HandleVerifyEmail consumes a verification token. It is a POST (not a GET link handler) so mail
// scanners that prefetch links cannot burn the token. The caller must also prove knowledge of the
// signup password: otherwise someone could register a victim's address with their own password and
// wait for the victim to click the emailed link, ending up with a verified account they control.
// The password is checked before the token is consumed, so a typo does not burn the link.
func (h *Handler) HandleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req tokenRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx := r.Context()
	user, err := h.repo.PeekToken(ctx, req.Token, purposeVerifyEmail)
	if errors.Is(err, ErrInvalidToken) {
		writeError(w, http.StatusBadRequest, "invalid or expired link")
		return
	}
	if err != nil {
		applogger.FromContext(ctx).Error("auth: verify email failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	match, cmpErr := argon2id.ComparePasswordAndHash(req.Password, user.PasswordHash)
	if cmpErr != nil || !match {
		writeError(w, http.StatusUnauthorized, "incorrect password")
		return
	}
	if _, err = h.repo.ConsumeToken(ctx, req.Token, purposeVerifyEmail); errors.Is(err, ErrInvalidToken) {
		writeError(w, http.StatusBadRequest, "invalid or expired link")
		return
	}
	verified := false
	if err == nil {
		verified, err = h.repo.MarkEmailVerified(ctx, user.ID, user.PasswordHash)
	}
	if err != nil {
		applogger.FromContext(ctx).Error("auth: verify email failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !verified {
		writeError(w, http.StatusBadRequest, "invalid or expired link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "verified"})
}

// HandleResendVerification re-sends the link for an unverified password account (enumeration-safe).
func (h *Handler) HandleResendVerification(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if h.limited(w, r, h.limits.resend, email) {
		return
	}
	ctx := r.Context()
	user, err := h.repo.GetUserByEmail(ctx, email)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		applogger.FromContext(ctx).Error("auth: resend lookup failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	case user.EmailVerifiedAt == nil && user.PasswordHash != "":
		h.sendVerification(ctx, user)
	}
	writeJSON(w, http.StatusAccepted, acceptedResponse)
}

// HandleForgot mails a reset link if the address has an account (enumeration-safe).
func (h *Handler) HandleForgot(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if h.limited(w, r, h.limits.forgot, email) {
		return
	}
	ctx := r.Context()
	user, err := h.repo.GetUserByEmail(ctx, email)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		applogger.FromContext(ctx).Error("auth: forgot lookup failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	default:
		h.sendLink(ctx, user, purposeResetPassword, resetTokenTTL, "/reset-password",
			"Reset your Cumin password", "Use this link to choose a new password. It expires in 1 hour.\n"+
				"If you didn't request this, you can ignore this email.")
	}
	writeJSON(w, http.StatusAccepted, acceptedResponse)
}

// HandleReset sets a new password from a reset token and signs the user out everywhere.
func (h *Handler) HandleReset(w http.ResponseWriter, r *http.Request) {
	var req tokenRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	// Validate before consuming so a too-short password doesn't burn the single-use link.
	if err := validatePassword(req.Password); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	l := applogger.FromContext(ctx)

	hash, err := argon2id.CreateHash(req.Password, argonParams)
	if err != nil {
		l.Error("auth: hash password failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	userID, err := h.repo.ConsumeToken(ctx, req.Token, purposeResetPassword)
	if errors.Is(err, ErrInvalidToken) {
		writeError(w, http.StatusBadRequest, "invalid or expired link")
		return
	}
	if err == nil {
		err = h.repo.SetPasswordVerified(ctx, userID, hash)
	}
	if err == nil {
		err = h.destroyUserSessions(ctx, userID)
	}
	if err != nil {
		l.Error("auth: reset password failed", slog.Any("err", err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	l.Info("auth: password reset", slog.String("user_id", userID))
	writeJSON(w, http.StatusOK, map[string]string{"status": "password_reset"})
}

// destroyUserSessions deletes every web session of the user. scs has no per-user index, so this
// scans all sessions (O(sessions)); fine at current scale, revisit with a user_id column.
func (h *Handler) destroyUserSessions(ctx context.Context, userID string) error {
	return h.sessions.Iterate(ctx, func(ctx context.Context) error {
		if h.sessions.GetString(ctx, sessionUserKey) == userID {
			return h.sessions.Destroy(ctx)
		}
		return nil
	})
}

func (h *Handler) sendVerification(ctx context.Context, user *User) {
	h.sendLink(ctx, user, purposeVerifyEmail, verifyTokenTTL, "/verify-email",
		"Verify your Cumin email", "Confirm your email address to finish creating your account. This link expires in 24 hours.")
}

// sendLink creates a token and mails the link in the background. Failures are logged, never
// returned, so the response can't reveal whether an account exists.
func (h *Handler) sendLink(ctx context.Context, user *User, purpose tokenPurpose, ttl time.Duration, path, subject, intro string) {
	l := applogger.FromContext(ctx)
	raw, err := h.repo.CreateToken(ctx, user.ID, purpose, ttl)
	if err != nil {
		l.Error("auth: create token failed", slog.String("user_id", user.ID), slog.Any("err", err))
		return
	}
	body := fmt.Sprintf("%s\n\n%s%s?token=%s\n", intro, h.frontendURL(), path, raw)
	to := user.Email
	h.async(func() {
		// Detached from the request: the response has already been sent.
		sendCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := h.mailer.Send(sendCtx, to, subject, body); err != nil {
			l.Error("auth: send mail failed", slog.String("user_id", user.ID), slog.Any("err", err))
		}
	})
}

func (h *Handler) limited(w http.ResponseWriter, r *http.Request, rl *httprate.RateLimiter, key string) bool {
	if rl.OnLimit(w, r, key) {
		writeError(w, http.StatusTooManyRequests, "too many requests, try again later")
		return true
	}
	return false
}

func validateEmail(raw string) (string, error) {
	email := normalizeEmail(raw)
	if email == "" || len(email) > maxEmailLen {
		return "", errors.New("a valid email is required")
	}
	addr, err := mail.ParseAddress(email)
	// ParseAddress also accepts "Name <a@b>"; require the bare address.
	if err != nil || addr.Address != email || !strings.Contains(email[strings.LastIndex(email, "@"):], ".") {
		return "", errors.New("a valid email is required")
	}
	return email, nil
}

func validatePassword(pw string) error {
	n := utf8.RuneCountInString(pw)
	if n < minPasswordLen {
		return fmt.Errorf("password must be at least %d characters", minPasswordLen)
	}
	if n > maxPasswordLen {
		return fmt.Errorf("password must be at most %d characters", maxPasswordLen)
	}
	return nil
}

func cleanName(name, email string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = email[:strings.Index(email, "@")]
	}
	if utf8.RuneCountInString(name) > maxNameLen {
		name = string([]rune(name)[:maxNameLen])
	}
	return name
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<16)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
