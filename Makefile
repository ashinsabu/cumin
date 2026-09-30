.PHONY: release

# New release:    make release [BUMP=minor|major]  (default: patch)
# Redeploy tag:   make release TAG=v1.2.3
BUMP ?= patch
release:
ifdef TAG
	@./scripts/release.sh --tag $(TAG)
else
	@./scripts/release.sh $(BUMP)
endif
