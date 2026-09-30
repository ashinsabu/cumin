# Item Edit + Create — HLD + LLD

**Status:** LOCKED — ready to implement  
**Agents debated:** 2 (extensible + conservative approaches; both converged)

---

## Decision

Single `ItemModal` component, 3 modes: `view | edit | create`. No separate CreateItemModal — they share 90% of fields and diverge only on submit path and display_id row.

---

## BoardContext Changes

Add two methods:

```ts
updateItem(id: string, patch: UpdatePayload): Promise<void>
createItem(payload: CreatePayload): Promise<Item>
```

**`updateItem`** — optimistic splice with rollback:
- Snapshot current items array
- `setItems(prev.map(i => i.id === id ? merge(i, patch) : i))`
- `PUT /api/items/{id}`
- On error: `setItems(snapshot)` + toast "Save failed — changes reverted"

**`createItem`** — server-first (no fake ID needed):
- `POST /api/items`
- On success: `setItems(prev => [...prev, res])`
- Returns new item so caller can `selectItem(res)` to open it

Add `UpdatePayload` and `CreatePayload` interfaces in `types/index.ts`.

---

## ItemModal Modes

### View → Edit transition
- Pencil icon top-right of modal header triggers edit mode
- Fields become interactive in-place
- Sticky footer shows `[Cancel]  [Save changes]`

### Dirty state guard
- Escape or backdrop-click with unsaved changes: show inline confirm row in footer
- "Discard changes? [Keep editing] [Discard]" — NOT `window.confirm()`

### Create mode
- Opened from `+ New item` buttons (see entry points)
- No display_id shown
- Title auto-focuses
- All fields editable from start
- Footer: `[Cancel]  [Create item]`

---

## Create Entry Points

| Location | Button | `status_id` preset |
|----------|--------|-------------------|
| Backlog view | `+ New item` at top of list | Board's initial status |
| Board view | `+` at bottom of each column | That column's status |

No inline row editing in backlog — too much keyboard/blur complexity for low payoff.

---

## Fields

| Field | Control | Notes |
|-------|---------|-------|
| Title | `<input type="text">` | Validates non-empty on save (shake animation) |
| Priority | P0–P4 toggle row (5 buttons) | Current highlighted |
| Estimate | `<input type="text" placeholder="e.g. 1h 30m">` | Parse on blur + on save |
| Epic | Searchable dropdown | Filter epics from context by name |
| Deadline | `<input type="date">` | Native date picker, stored as YYYY-MM-DD |
| Description | `<textarea>` | Plain text now; swap for rich text editor later without modal changes |

### Estimate parsing

```
"2h"     → 120    "45m"  → 45    "1h 30m" → 90
"1h30m"  → 90     "90"   → 90    ""       → null (clears)
anything else → inline error: "Use format: 2h, 45m, or 1h 30m"
```

Show parsed result as grey hint below input on blur: `= 1h 30m`

---

## Error Handling

- **Network fail during save:** rollback state, toast "Save failed — check your connection", retain draft values for retry
- **4xx from API:** inline error below title or toast
- **Epic deleted between load and save:** `clear_epic: true` field in UpdateRequest handles this (already in API)

---

## Explicitly NOT in scope

- Rich text / markdown
- Attachments, comments, activity feed
- Sub-tasks
- Assignee (no multi-user model yet)
- Sprint assignment in create (sprints have their own planning flow)
- Keyboard shortcut to open create modal

---

## File Impact

| File | Change |
|------|--------|
| `types/index.ts` | Add `UpdatePayload`, `CreatePayload` |
| `context/BoardContext.tsx` | Add `updateItem`, `createItem`; expand context type |
| `components/ItemModal.tsx` | Mode-aware rewrite; add field controls |
| `hooks/useEstimate.ts` | New: `parseEstimate` + move `formatEstimate` here |
| `views/BacklogView.tsx` | Add `+ New item` button |
| `views/BoardView.tsx` | Add `+` button per column |
