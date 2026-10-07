DB_URL ?= postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable
TEST_DATABASE_URL ?= $(DB_URL)

.PHONY: dev run spec check check-server check-ui testdata cleandata wipe-user

# Run all pre-commit checks — works on any machine with Go, Node, and Docker.
# Spins up a throwaway Postgres container for integration tests, tears it down after.
check: check-server check-ui
	@echo ""
	@echo "✓ ALL CHECKS PASSED"

check-server:
	@echo "==> [server] build"
	@go build ./...
	@echo "==> [server] vet"
	@go vet ./...
	@echo "==> [server] integration tests (docker DB)"
	@docker compose -f ../docker-compose.yml up -d db 2>/dev/null
	@until docker compose -f ../docker-compose.yml exec -T db pg_isready -U cumin -q 2>/dev/null; do sleep 0.3; done
	@TEST_DATABASE_URL=postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable \
	  go test ./integration/... -count=1 -timeout 60s
	@docker compose -f ../docker-compose.yml stop db 2>/dev/null

check-ui:
	@echo "==> [ui] build"
	@cd ../ui && npm run build --silent
	@echo "==> [ui] tests"
	@cd ../ui && npm test

# Start DB + server + UI in one shot (from repo root)
dev:
	cd .. && ./dev.sh

run:
	go run ./cmd/cumin

spec:
	swag init -g cmd/cumin/main.go -o docs --parseDependency --parseInternal

testdata: cleandata
	@echo "==> Seeding test data..."
	@psql "$(DB_URL)" -f scripts/testdata.sql
	@echo "==> Done."

cleandata:
	@echo "==> Cleaning domain data..."
	@psql "$(DB_URL)" -c "DELETE FROM status_transitions; DELETE FROM items; DELETE FROM sprints; DELETE FROM epics; DELETE FROM projects; UPDATE boards SET item_seq = 0;"
	@echo "==> Clean."

# Wipe a user completely so the next login triggers fresh provisioning.
# Usage: make wipe-user EMAIL=you@example.com
wipe-user:
	@test -n "$(EMAIL)" || (echo "Usage: make wipe-user EMAIL=you@example.com" && exit 1)
	@psql "$(DB_URL)" -c " \
		DO \$\$ \
		DECLARE v_uid UUID; v_bid UUID; \
		BEGIN \
		  SELECT id INTO v_uid FROM users WHERE email = '$(EMAIL)'; \
		  SELECT id INTO v_bid FROM boards WHERE user_id = v_uid; \
		  DELETE FROM status_transitions WHERE item_id IN (SELECT id FROM items WHERE board_id = v_bid); \
		  DELETE FROM items WHERE board_id = v_bid; \
		  DELETE FROM statuses WHERE board_id = v_bid; \
		  DELETE FROM sprints WHERE board_id = v_bid; \
		  DELETE FROM epics WHERE board_id = v_bid; \
		  DELETE FROM projects WHERE board_id = v_bid; \
		  DELETE FROM boards WHERE id = v_bid; \
		  DELETE FROM users WHERE id = v_uid; \
		END \$\$;"
	@echo "==> User $(EMAIL) wiped. Next login will re-provision."
