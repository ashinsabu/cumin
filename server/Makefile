DB_URL ?= postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable

.PHONY: dev run testdata cleandata wipe-user

# Start DB + server + UI in one shot (from repo root)
dev:
	cd .. && ./dev.sh

run:
	go run ./cmd/cumin

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
