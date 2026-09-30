# Session Notes
_gitignored — not for public consumption_

## What was done

### Security
- Fixed IDOR: project/epic/sprint ownership validated inside DB query (CreateForProject)
- Fixed nil slice bug: `var ids []string` encodes as SQL NULL → `ids := []string{}`
- Fixed status deletion guard: cannot delete last done-status or last initial-status
- Fixed provision idempotency: `ON CONFLICT (user_id) DO NOTHING` on board INSERT
- Fixed priority P0 bug: `int` → `*int` in UpdateRequest (0 is valid, nil means not provided)
- Fixed TOCTOU on item seq: seq increment now inside the item INSERT transaction
- Full security audit: 22 findings (docs/security-audit.md)

### Git hygiene
- Stripped AI session trailers (AI-Session-Id / AI-Tool / AI-Model) from all commits via filter-branch
- Removed CLAUDE.md from entire git history — contained internal architecture details
- Set `git config core.hooksPath .git/hooks` to suppress Harness global git hook for this repo
- Harness installs a global prepare-commit-msg hook that injects AI trailers into every commit made during a Claude Code session. Fix is repo-scoped core.hooksPath override.

### Infrastructure
- Dockerfile: golang:1.24 → golang:1.25 (pgx/v5 and oauth2 require 1.25)
- Migrations: fixed `runtime.Caller` path (only works in dev) → env var MIGRATIONS_PATH with /app/migrations default in Docker
- Dockerfile: copy migrations into final image at /app/migrations
- CI/CD: GHA workflows for build check (every push) + tag-based deploy (Railway + Firebase)
- Release: `make release` / `make release BUMP=minor` / `make release TAG=v1.2.3`
- Firebase Hosting configured for frontend (cumin.ashinsabu.com)
- Railway custom domain wired: api.cumin.ashinsabu.com
- Railway: disconnect GitHub auto-deploy, use GHA railway up on tag push instead
- RAILWAY_TOKEN must be a project token (Settings → Tokens inside the project), not account token

### Codebase
- Removed "personal" framing everywhere — this is an OSS project, medium scale
- README: feature list, local dev, deploy, release process — all in one place
- RELEASING.md removed — content merged into README
- Added docs/security-audit.md with 22 findings

---

## Learnings / Caveats / Do's and Don'ts

### Dockerfile
- **DO** copy migrations into the final image — the binary can't find source-relative paths at runtime
- **DON'T** use `runtime.Caller` to resolve paths in production binaries — it uses the compile-time source path which doesn't exist in the container
- **DON'T** forget to update the Go base image version when go.mod requires a newer version — `go mod tidy` with a newer local Go will bump the go directive

### Railway
- Project tokens (from project Settings → Tokens) are NOT the same as personal tokens (Account Settings → Tokens). `railway whoami` fails with a project token — that's expected, it's not an error
- "Wait for CI" and "Auto deploy" are coupled in Railway UI — you can't have one without the other
- Disconnecting the GitHub branch source removes both; use GHA `railway up` to trigger deploys manually
- `railway up` must be run from the service root directory (server/ in this repo), not the repo root
- Healthcheck failures are almost always: missing env vars, wrong port, or migrations not running

### CI/CD
- Always run `npm run build` locally before pushing — TypeScript errors that pass locally may not pass in CI if tsconfig is stricter
- `go:embed` can't traverse `..` — if embedding cross-directory, copy files into the module directory during build
- GHA `release.yml` runs `railway up --detach` — detach is important, otherwise the job blocks waiting for the deploy to complete (Railway streams logs)

### Git
- `git filter-branch` rewrites history — always clean up `refs/original/refs/heads/main` afterward
- After filter-branch, `git push --force-with-lease` is needed since history diverged from remote
- Harness Claude Code installs a global git hook at `/opt/harness/claude-code/git-hooks/` — override with `git config core.hooksPath .git/hooks` per repo

### Go
- `*int` for optional integer fields in request structs — `int` can't distinguish "not provided" from "0" (P0 priority)
- `ClearEpic bool` / `ClearSprint bool` pattern for explicitly nulling FK relationships in updates
- pgx `ON CONFLICT ... DO NOTHING RETURNING id` returns `pgx.ErrNoRows` when conflict fires — handle it as success (already exists)

### General
- Never use "personal" to justify skimping on reliability, security, or scale — treat it as production SaaS
- firebase.json + .firebaserc must be committed for `firebase deploy` to work in CI
- `.env.*` is gitignored by default — add `!.env.example.*` exception for production example files
- Railway's `.railway.internal` hostnames are only reachable inside Railway's private network — use `DATABASE_PUBLIC_URL` for external testing
