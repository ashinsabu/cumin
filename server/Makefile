DB_URL ?= postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable

.PHONY: run testdata cleandata

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
