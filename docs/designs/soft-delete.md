# Soft Delete — HLD + LLD

**Status:** LOCKED — ready to implement  
**Agents debated:** 2 (audit-log approach + timestamp-key approach; merged below)

---

## Decision

Hybrid approach: `deleted_at TIMESTAMPTZ` on `projects`, `epics`, `items`. The timestamp IS the cascade key — no separate audit_events table needed for restore correctness.

Why items too: `SET NULL` (current behavior) loses the relationship silently. Cascading the timestamp preserves the full snapshot and makes atomic restore possible.

---

## Migration: `005_soft_delete.up.sql`

```sql
ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE epics    ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE items    ADD COLUMN deleted_at TIMESTAMPTZ;

-- Live queries never scan trash
CREATE INDEX idx_projects_board_live ON projects(board_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_epics_board_live    ON epics(board_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_items_board_live    ON items(board_id)    WHERE deleted_at IS NULL;

-- Trash queries: find children by cascade batch
CREATE INDEX idx_items_deleted_at ON items(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_epics_deleted_at  ON epics(deleted_at) WHERE deleted_at IS NOT NULL;
```

Replace `ON DELETE SET NULL` FKs with `ON DELETE RESTRICT` — soft delete is the only deletion path now.

---

## Cascade Rule

When a project or epic is soft-deleted:
1. Record `$ts = NOW()`
2. In same transaction: `UPDATE items SET deleted_at = $ts WHERE project_id = $id AND deleted_at IS NULL`
3. For projects: also cascade to epics, then cascade to items belonging to those epics

The shared timestamp is the cascade batch key.

---

## Restore Rule

```sql
-- Restore project
UPDATE projects SET deleted_at = NULL WHERE id = $id;
UPDATE epics    SET deleted_at = NULL WHERE project_id = $id AND deleted_at = $project_deleted_at;
UPDATE items    SET deleted_at = NULL WHERE project_id = $id AND deleted_at = $project_deleted_at;
```

Only restores children where `deleted_at` matches the cascade batch exactly. Items moved/deleted independently (different timestamp) are untouched.

---

## Prefix Collision on Restore

Before restoring a project, check:
```sql
SELECT 1 FROM projects WHERE board_id = $board AND prefix = $prefix AND deleted_at IS NULL
```

If conflict: return `HTTP 409 "Prefix '{X}' is in use by another project — rename it before restoring."` Do NOT auto-rename.

---

## API Changes

**All LIST queries:** append `AND deleted_at IS NULL` — single change per query.

**`DELETE /api/projects/{id}`:** Replace item-count guard with soft delete cascade (no longer block — trash is the undo).

**`DELETE /api/epics/{id}`:** Same pattern — soft delete + cascade to items.

**New endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/trash` | Soft-deleted projects + epics, child item counts, ordered by `deleted_at DESC` |
| `POST` | `/api/projects/{id}/restore` | Restore project + cascade batch |
| `POST` | `/api/epics/{id}/restore` | Restore epic + cascade batch |
| `DELETE` | `/api/projects/{id}/purge` | Hard delete; only allowed when `deleted_at IS NOT NULL` |
| `DELETE` | `/api/epics/{id}/purge` | Same, scoped to epic |

---

## Retention

30-day automatic hard purge. Requires a real background worker — not just a SQL statement, something must trigger it.

**Implementation: Go goroutine with `time.Ticker` in `main.go`:**

```go
func startPurgeWorker(db *pgxpool.Pool) {
    ticker := time.NewTicker(24 * time.Hour)
    go func() {
        for range ticker.C {
            ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
            db.Exec(ctx, `DELETE FROM items    WHERE deleted_at < NOW() - INTERVAL '30 days'`)
            db.Exec(ctx, `DELETE FROM epics    WHERE deleted_at < NOW() - INTERVAL '30 days'`)
            db.Exec(ctx, `DELETE FROM projects WHERE deleted_at < NOW() - INTERVAL '30 days'`)
            cancel()
        }
    }()
}
```

Called once at startup. On Railway (single instance), this is sufficient. If ever multi-instance, move to a DB cron job (`pg_cron`) instead.

Also expose "Empty Trash" button in UI that purges all trash immediately via `DELETE /api/trash`.

---

## Trash UI

- Sidebar entry: "Trash" below main nav
- Flat list: deleted projects first, then epics
- Each row: name, "deleted 3 days ago", child item count
- Row actions: Restore | Purge
- Top action: "Empty Trash"

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Prefix conflict on restore | 409 block, user must rename active project |
| Items moved to another epic before epic delete | Different `epic_id`, not in cascade batch — unaffected by restore |
| Item deleted independently (different timestamp) | Stays in trash on its own 30-day clock |
| Restore of parent when child items were independently trashed | Only cascade-batch children restored; independent deletes untouched |

---

## NOT in scope

- Per-item trash UI (items are footnotes, not first-class trash)
- Full audit log / per-field diffs
- Soft delete on `statuses` or `sprints`
- Retention policy UI
