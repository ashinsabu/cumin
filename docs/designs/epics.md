# Epics — Design

**Status:** LOCKED  

---

## Concept

Epics are quarterly-scoped initiatives, not item groupings. An epic represents a meaningful chunk of work with a defined outcome. Items belong to epics; epics belong to a board.

---

## Size Field

`size TEXT CHECK (size IN ('XS', 'S', 'M', 'L', 'XL'))` — nullable, no default.

| Size | Scope | Typical duration |
|------|-------|-----------------|
| XS | Single task cluster | 1–3 days |
| S | Small initiative | ~1 week |
| M | Mid-size feature/goal | 2–4 weeks |
| L | Major initiative | 1–2 months |
| XL | Quarterly objective | ~3 months |

Null = unsized (legacy / uncategorized). UI shows soft nudge on create: "Add a size to track quarterly scope."

---

## Epic Type

`type TEXT CHECK (type IN ('recurring', 'goal', 'catchall'))`

- **recurring** — repeats each quarter (e.g. gym habit, reading). Tends to be XS/S.
- **goal** — closes when achieved (e.g. interview prep, home renovation). Tends to be L/XL.
- **catchall** — miscellaneous bucket. No lifecycle expectation.

---

## Migration Addition

```sql
ALTER TABLE epics ADD COLUMN size TEXT CHECK (size IN ('XS', 'S', 'M', 'L', 'XL'));
```

---

## Epics View — Display Rules

### Progress display by size

| Size | Progress display |
|------|-----------------|
| XL | Full progress bar + percentage |
| L | Full progress bar + percentage |
| M | Compact: `3/7 items` (no bar) |
| S | Compact: `3/7 items` (no bar) |
| XS | Compact: `3/7 items` (no bar) |

Progress bar: `completed_estimate / total_estimate` (estimate-weighted). Falls back to item count ratio if no estimates set.

### Size badge

Displayed next to the epic name, before any other metadata. Most important signal — read first.

```
● Interview Preparation  [XL]  ████████░░  40%  Oct 14  P0
```

### Default sort

XL → L → M → S → XS, then by deadline within size. Biggest commitments first.

---

## Epic Row — Information Hierarchy

```
[color dot] [name]  [size badge]  [type badge]  [items done/total]  [progress]  [deadline]
```

- L/XL: full progress bar in the progress column
- M/S/XS: `done/total` number only in the progress column

---

## NOT in scope

- Epic size affecting sprint capacity calculations (size is a label, not a time budget)
- At-risk indicators based on size vs. deadline vs. remaining hours (future)
- Epic dependencies or sequencing
- Epic ownership (no multi-user yet)
