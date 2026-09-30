# Sprint Management UI — HLD + LLD

**Status:** NEEDS DECISION on UX pattern (see below)  
**Agents debated:** 2 (standard sidebar approach vs. zero-friction inline approach)

---

## Open Decision Required

Two meaningfully different UX patterns — need user choice before implementing:

| | Option A: Sidebar Planner | Option B: Inline from Badge |
|--|--------------------------|----------------------------|
| Entry point | "Sprints" in sidebar nav | "No active sprint" badge in header expands inline |
| New page? | Yes — full Sprint Planner page | No — no navigation change |
| Learning curve | Familiar (Jira-style) | Lower — never leaves context |
| Time to first sprint | ~5 clicks | ~2 clicks |
| Good for | Power users, planning ahead | Onboarding, simplicity |

---

## Shared: Sprint Data Model (both options)

`BoardContext` additions:
```ts
activeSprint: Sprint | null
sprints: Sprint[]
startSprint(sprintId: string): Promise<void>
completeSprint(sprintId: string): Promise<void>
```

No separate SprintContext — sprint data is always scoped to a board, all components need it together.

---

## Sprint Creation Fields

| Field | Default | Required? |
|-------|---------|-----------|
| Name | "Sprint 1" (auto-incremented) | Yes |
| Start date | Today | Yes |
| End date | Today + 7 days | Yes |
| Capacity hours | (blank) | No — soft nudge if omitted |

Capacity soft nudge: "Add capacity to unlock the 80/20 guide."

---

## Start Sprint Validation

Before allowing Start:
1. No other sprint currently `active` (DB enforces; surface as blocking error)
2. Start date ≤ today
3. At least 1 item assigned (soft warning, not a blocker — user confirms)
4. Estimated hours ≤ capacity × 0.8 (soft warning with current vs. budget shown)

---

## 80/20 Capacity Bar

When capacity is set, sprint header shows:
```
Capacity: ████████░░  72h / 90h  (80% = 72h)  ✓ Within buffer
```

Updates live as items are added. Turns amber past 80%: "Above the 80% buffer — leave room for surprises." Warns but never blocks.

---

## Adding Items to Sprint

During planning: two-column layout — Backlog left, Sprint Backlog right. Items move via checkbox + "Add to Sprint" or drag-and-drop. Capacity bar updates live.

Once active: items added/removed via item context menu ("Move to sprint" / "Remove from sprint"). No drag-and-drop on active sprints — too easy to do accidentally.

---

## Complete Sprint Flow

Completion modal (no form fields):
```
Sprint complete!
8 items done · 3 items spilled to backlog
[Complete Sprint]   [Cancel]
```

Incomplete items automatically return to backlog. No decision required from user.  
Post-completion: board enters "No active sprint" state, CTA: "Start Sprint 2."

---

## Option A Details (Sidebar Planner)

- "Sprints" nav item added to sidebar, grouped with Board + Backlog
- Full-page two-column Sprint Planner
- "No active sprint" badge in header → navigates to Sprints page
- Historical sprint list visible in planner

## Option B Details (Inline)

- No new sidebar entry
- "No active sprint" badge expands inline in header
- Minimum form: 3 pre-filled fields, one button → Start Sprint
- Step 2: item selection checklist appears, "Skip, I'll drag items in" escape hatch
- Target: running sprint in under 60 seconds from first click

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| 0 items at sprint start | Allowed with warning; sprint is valid |
| Overlapping dates with another sprint | DB enforces one active; warn on create if dates overlap planned sprint |
| No capacity set | Allow; disable 80/20 bar until capacity added |
| Complete sprint with 0 done items | Valid; all items spill to backlog |

---

## NOT in scope

- Sprint templates, recurring sprints
- Velocity forecasting / Gantt view
- Multi-sprint planning board
- Email/notification on sprint start/complete
- Sub-sprints
