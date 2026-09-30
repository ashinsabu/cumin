.PHONY: release

# Bump and release. Usage: make release BUMP=minor (default: patch)
BUMP ?= patch
release:
	@./scripts/release.sh $(BUMP)
