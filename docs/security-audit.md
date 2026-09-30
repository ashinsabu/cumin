# Security Audit — Cumin API

Audit scope: auth & session layer, authorization & data isolation, input validation & injection.
Date: 2026-09-30

---

## Summary

| ID | Severity | Area | Fix effort |
|----|----------|------|------------|
| C1 | CRITICAL | OAuth CSRF — static state, never validated | Medium |
| C2 | CRITICAL | JWT secret has public default — forgeable tokens | Small |
| H1 | HIGH | Cookie `Secure` flag always false behind reverse proxy | Trivial |
| H2 | HIGH | No session revocation on logout — JWT valid 24h after clear | Medium |
| H3 | HIGH | Raw Go error strings returned to HTTP clients | Trivial |
| H4 | HIGH | `GetByID` ownership check in handler not in query — fragile | Medium |
| H5 | HIGH | `DeleteStatus` exported with no board ownership check | Trivial |
| M1 | MEDIUM | `AUTH_DISABLED` has no production environment guard | Trivial |
| M2 | MEDIUM | Logout cookie missing `Secure` and `SameSite` | Trivial |
| M3 | MEDIUM | JWT missing `iss`/`aud` claims | Small |
| M4 | MEDIUM | No length limits on any text field | Small |
| M5 | MEDIUM | Negative `estimate_minutes` accepted without bounds check | Small |
| M6 | MEDIUM | Negative `sprint_cadence_days` stored in board | Small |
| M7 | MEDIUM | No UUID format validation on path parameters | Small |
| M8 | MEDIUM | `Reorder` doesn't validate `status_id` belongs to caller's board | Small |
| M9 | MEDIUM | `sprint_id` query param not validated against caller's board | Small |
| L1 | LOW | `SameSite=Lax` vs Strict | Trivial |
| L2 | LOW | No minimum JWT secret length warning | Trivial |
| L3 | LOW | `http.DefaultClient` used for Google userinfo — no timeout | Trivial |
| L4 | LOW | Out-of-range priority silently clamped instead of rejected | Trivial |
| L5 | LOW | `color` fields accept arbitrary strings — CSS injection risk | Small |
| L6 | LOW | `NextSeq` exported with no ownership guard | Trivial |
| L7 | LOW | `Update` store functions filter by bare `id` — TOCTOU in principle | Small |

---

## CRITICAL

### C1 — OAuth state is a static string; callback never validates it
**File:** `auth/oauth.go:52`, `auth/oauth.go:56–111`

```go
url := h.oauth.AuthCodeURL("state", oauth2.AccessTypeOffline)
// callback never reads or checks r.URL.Query().Get("state")
```

**Attack:** Login-CSRF. Attacker initiates their own Google OAuth flow, captures the redirect URL before completing it, tricks a victim into visiting it. Google issues a token tied to the attacker's Google account; the victim's browser completes the exchange and is now logged into the attacker's account.

**Fix:** Generate a cryptographically random state token per login, store it in a short-lived `HttpOnly; SameSite=Strict` cookie, verify in the callback:
```go
state := base64.URLEncoding.EncodeToString(randomBytes(32))
http.SetCookie(w, &http.Cookie{Name: "oauth_state", Value: state, MaxAge: 300, HttpOnly: true, SameSite: http.SameSiteStrictMode})
url := h.oauth.AuthCodeURL(state, ...)

// callback
cookie, _ := r.Cookie("oauth_state")
if r.URL.Query().Get("state") != cookie.Value {
    http.Error(w, "invalid state", http.StatusForbidden)
    return
}
```

---

### C2 — JWT secret has a public default value
**File:** `config/config.go:13`

```go
JWTSecret string `envconfig:"JWT_SECRET" default:"local-dev-secret"`
```

If `JWT_SECRET` is unset in production, the secret is the well-known string `"local-dev-secret"`. Any attacker can mint a valid HS256 JWT for any `user_id` and authenticate as any user.

**Fix:** Remove the default. Assert minimum entropy on startup:
```go
if cfg.JWTSecret == "" {
    log.Fatal("JWT_SECRET must be set")
}
if cfg.Env != "development" && len(cfg.JWTSecret) < 32 {
    log.Fatal("JWT_SECRET must be at least 32 characters in non-development environments")
}
```

---

## HIGH

### H1 — Cookie `Secure` flag always false behind reverse proxy
**File:** `auth/oauth.go:105`

```go
Secure: r.TLS != nil,
```

Railway (and all standard reverse-proxy setups) terminates TLS at the edge. The Go process sees plain HTTP, so `r.TLS` is always `nil` and the `Secure` flag is never set. The session cookie can be transmitted over plain HTTP.

**Fix:**
```go
Secure: cfg.Env == "production",
```

---

### H2 — No session revocation on logout
**File:** `auth/oauth.go:128–138`, `auth/jwt.go`

`HandleLogout` clears the cookie client-side but the JWT remains cryptographically valid for 24 hours. There is no token blacklist, `jti` claim, or session table. An exfiltrated token retains full access until it expires.

**Fix (pragmatic):** Short expiry (15–30 min) + server-side refresh token stored in the DB (one row per session, deleted on logout). At minimum, add a unique `jti` claim and maintain a small blacklist pruned at expiry time.

---

### H3 — Raw Go error strings returned to HTTP clients
**File:** `auth/oauth.go:64,69,74,79,84,89`, `sprint/handler.go:159`

```go
http.Error(w, fmt.Sprintf("token exchange: %v", err), http.StatusInternalServerError)
return nil, api.Conflict("close failed: " + err.Error())
```

DB driver errors, connection strings, and internal type names can appear verbatim in HTTP responses.

**Fix:** Log full error server-side; return a generic message:
```go
log.Printf("token exchange: %v", err)
http.Error(w, `{"error":"authentication failed"}`, http.StatusInternalServerError)
```

---

### H4 — Board ownership checked in handler, not in query
**Files:** `item/store.go:126`, `epic/store.go:46`, `sprint/store.go:112`, `project/store.go:46`

All four `GetByID` functions query by `id` alone. Every current handler does the right thing — fetches, then checks `it.BoardID != b.ID` — but this is a contract enforced by convention, not by the query. Any future caller that skips the post-check silently exposes another user's data.

**Fix:** Add `boardID` as a parameter and filter in SQL:
```go
func (s *Store) GetByID(ctx context.Context, id, boardID string) (*Item, error) {
    row := s.DB.QueryRow(ctx, `SELECT … WHERE id = $1 AND board_id = $2`, id, boardID)
    ...
}
```

---

### H5 — `DeleteStatus` exported with no board ownership check
**File:** `board/store.go:109`

```go
func (s *Store) DeleteStatus(ctx context.Context, id string) error {
    _, err := s.DB.Exec(ctx, `DELETE FROM statuses WHERE id = $1`, id)
    return err
}
```

The safe variant `DeleteStatusForBoard` exists at line 114. `DeleteStatus` appears to have no callers — if so, delete it. If kept, any future caller can delete any user's status by ID.

**Fix:** Delete the function or unexport it.

---

## MEDIUM

### M1 — `AUTH_DISABLED` has no production guard
**File:** `cmd/cumin/main.go:59`

`AUTH_DISABLED=true` replaces the entire auth layer with a hardcoded UUID. There is no check preventing this in a production environment.

**Fix:**
```go
if cfg.AuthDisabled && cfg.Env == "production" {
    log.Fatal("AUTH_DISABLED cannot be set in production")
}
```

---

### M2 — Logout cookie missing `Secure` and `SameSite`
**File:** `auth/oauth.go:129–137`

The logout deletion cookie omits `Secure` and `SameSite`, which the session cookie sets. Browsers may not reliably clear a `Secure` cookie with a non-Secure deletion response.

**Fix:** Mirror all attributes from the set operation on the logout cookie.

---

### M3 — JWT missing `iss` and `aud` claims
**File:** `auth/jwt.go:17–26`

Without issuer/audience claims, a JWT signed with a reused secret (e.g. copy-pasted across services) would be accepted by any service.

**Fix:** Add `Issuer: "cumin"` and `Audience: []string{"cumin-api"}` to `RegisteredClaims` and validate them in `ParseWithClaims`.

---

### M4 — No length limits on text fields
**Files:** `item/handler.go`, `epic/handler.go`, `board/handler.go`, `project/handler.go`

No field (title, description, name) has a max-length guard. A client can send multi-megabyte strings.

**Fix:** Enforce at the handler layer. Suggested limits: name/title 500 chars, description 10,000 chars.

---

### M5 — `estimate_minutes` accepts negative values
**Files:** `item/handler.go:161`, `item/handler.go:228`

No lower or upper bound check. Negative estimates corrupt sprint capacity totals.

**Fix:**
```go
if *req.EstimateMinutes < 0 || *req.EstimateMinutes > 5256000 {
    return nil, api.BadRequest("estimate_minutes out of range")
}
```

---

### M6 — `sprint_cadence_days` accepts negative values
**File:** `board/handler.go:67`

Only `0` is blocked. Negative cadence is stored in the DB and corrupts sprint creation.

**Fix:**
```go
if req.SprintCadenceDays < 1 || req.SprintCadenceDays > 365 {
    return nil, api.BadRequest("sprint_cadence_days must be 1–365")
}
```

---

### M7 — No UUID validation on path parameters
**Files:** All handler `GetByID` call sites

Arbitrary strings reach the DB. Invalid UUIDs surface as 500s from the DB driver, leaking that the format was wrong.

**Fix:** Validate with `uuid.Parse` before hitting the store; return 404 on invalid format.

---

### M8 — `Reorder` doesn't validate `status_id` against caller's board
**File:** `item/handler.go:283`

`Move` validates the target status against the board's status list; `Reorder` does not. A foreign `status_id` results in a silent no-op rather than an explicit error.

**Fix:** Apply the same status membership check used in `Move` before calling `store.Reorder`.

---

### M9 — `sprint_id` query param not validated against caller's board
**File:** `item/handler.go:80`

A foreign `sprint_id` in `GET /api/items?sprint_id=` returns an empty 200 instead of a 400. Inconsistent with how `sprint_id` is validated on Create and Update.

**Fix:** Call `h.store.SprintBelongsToBoard` before passing to the list query.

---

## LOW

### L1 — `SameSite=Lax` vs `Strict`
All mutations are POST/PATCH/DELETE so Lax is adequate. `Strict` would be marginally safer and is low-risk for a SPA.

### L2 — No minimum JWT secret length warning in dev
A developer could set `JWT_SECRET=x` and the app starts normally. Log a warning in dev if the secret is under 16 characters.

### L3 — `http.DefaultClient` used for Google userinfo fetch
**File:** `auth/oauth.go:145`

No timeout. A hung Google endpoint holds a goroutine and DB connection open indefinitely.

**Fix:** `&http.Client{Timeout: 10 * time.Second}`

### L4 — Out-of-range priority silently clamped to 4
**File:** `item/handler.go:137`

`priority=99` is accepted and stored as `4`. Should return a 400.

### L5 — `color` fields accept arbitrary strings
**Files:** `epic/handler.go:84`, `project/handler.go:76`

No format validation. If rendered directly in a `style` attribute, this is a stored CSS injection vector.

**Fix:** Validate against `^#[0-9a-fA-F]{6}$`.

### L6 — `NextSeq` exported with no ownership guard
**File:** `board/store.go:66`

Any package could increment another board's sequence counter. Unexport if there are no external callers.

### L7 — `Update` store functions filter by bare `id`
All `Update` functions accept a bare `id` with no board filter in SQL, relying on the handler to have pre-validated ownership. Same fragility as H4. Add `AND board_id = $N` to every UPDATE.

---

## What's confirmed safe

- **SQL injection** — all queries fully parameterized via pgx, no string concatenation with user data
- **Mass assignment** — `board_id`, `display_id`, `created_at`, `status_id`, `item_seq` are never user-settable in update structs
- **Nil pointer dereferences** — all pointer fields checked for nil before use throughout handlers
- **Cross-board data access** — board ownership derived from authenticated user via `GetByUser`, never accepted from request body
- **CORS** — locked to `cfg.FrontendURL`, no wildcard
- **Sprint spillover** — `status_id != ALL($3)` array binding is correct and safe
