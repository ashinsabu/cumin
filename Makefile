.PHONY: release check check-ui check-server

# Run before every commit: make check
check: check-server check-ui

check-server:
	@echo "→ Go build + vet"
	@cd server && go build ./... && go vet ./...

check-ui:
	@echo "→ TypeScript (strict)"
	@cd ui && npx tsc -p tsconfig.app.json --noEmit
	@echo "→ Vite build"
	@cd ui && npm run build -- --mode development 2>&1 | tail -5

# New release:    make release [BUMP=minor|major]  (default: patch)
# Redeploy tag:   make release TAG=v1.2.3
BUMP ?= patch
release:
ifdef TAG
	@./scripts/release.sh --tag $(TAG)
else
	@./scripts/release.sh $(BUMP)
endif
