# Cumin — UI Design & UX Decisions

## Core Principle: Mobile-First

This app runs your life — you'll check it on your phone constantly. Every view must work perfectly on a 375px screen first, then scale up to desktop. No horizontal scrolling, no tiny tap targets, no hidden-behind-hover interactions.

---

## Navigation Structure

Two tabs. That's it. (Bottom nav on mobile, sidebar on desktop.)

```
┌─────────────────────────────────┐
│          CUMIN                    │
├─────────────────────────────────┤
│                                  │
│         [Active View]            │
│                                  │
├─────────────────────────────────┤
│   [ Board ]    [ Backlog ]       │  ← bottom tabs (mobile)
└─────────────────────────────────┘
```

### Tab 1: Board (default)

The sprint kanban view. Shows the **active sprint** items organized by status columns.

**Desktop**: horizontal columns (like the Jira screenshot)
**Mobile**: vertical stack — one status section at a time, swipeable or collapsible accordion

**What's on a card:**
```
┌─────────────────────────────┐
│ [P1] ASH-42                 │
│ Fix interview prep schedule │
│                             │
│ [Q2 INTERVIEW PREP]  2h    │
│ ⏱ 3d in status    📅 Jun 2 │
└─────────────────────────────┘
```
- Priority badge (color-coded: P0=red, P1=orange, P2=yellow, P3=blue, P4=gray)
- Display ID
- Title (truncated)
- Epic label (colored chip)
- Estimate
- Time in current status (computed live)
- Deadline (if set, red if overdue)

**Drag-and-drop**: Cards can be dragged between columns (status change) and within columns (reorder). On mobile: long-press to grab, or use a "Move to..." action sheet.

**Header shows**: Sprint name, dates, total estimate, items done/total

### Tab 2: Backlog

Prioritized flat list of all items NOT in the active sprint. Filterable by epic.

**Actions**: Tap item to edit, swipe right to pull into active sprint.

**Sections** (collapsible):
- P0 items (if any — red section)
- P1 items
- P2 items
- P3–P4 items

---

## Secondary Views (accessible from tabs, not separate tabs)

### Epic Detail
Tap an epic label anywhere → see all items in that epic across all sprints.
- Progress bar (done estimate / total estimate)
- Deadline countdown (if set)
- List of items grouped by status

### Item Detail
Tap a card → full item view.
- All fields editable inline
- Status transition buttons ("Move to IN PROGRESS")
- Time-in-status breakdown (mini bar chart)
- History log (status changes with timestamps)

### Sprint Management
Accessible from Board tab header (gear icon or "Sprint" link).
- View past sprints (read-only archive)
- Complete current sprint manually
- Create next sprint
- See spillover history

### Settings
Profile, board settings (rename, status columns, sprint cadence), prefix config.

---

## Mobile UX Patterns

| Pattern | Decision |
|---------|----------|
| Navigation | Bottom tab bar (2 tabs) — thumb-reachable |
| Board columns | Horizontal swipe between statuses OR collapsible accordion (test both) |
| Card actions | Tap = open detail. Long-press = drag. Swipe = quick actions |
| New item | FAB (floating action button) bottom-right, always visible |
| Filters | Top bar chips (epic, priority) — horizontally scrollable |
| Transitions | Bottom sheet with status options (big tap targets) |
| Pull-to-refresh | Sync board state |

---

## Desktop Enhancements

On wider screens (>768px):
- Board shows all columns side-by-side (horizontal scroll if >5 columns)
- Sidebar with: board switcher, epics list, sprint selector
- Keyboard shortcuts (N=new item, B=backlog, 1-4=filter priority)
- Bulk select (shift-click multiple items, batch move/assign)

---

## Login Screen

```
┌─────────────────────────────────┐
│                                  │
│            🫛                    │
│           cumin                   │
│    your life, sprint by sprint   │
│                                  │
│   ┌─────────────────────────┐   │
│   │  Sign in with Google    │   │
│   └─────────────────────────┘   │
│                                  │
└─────────────────────────────────┘
```

- Single button. No form fields. No "create account" — it's the same button.
- On success: land directly on the Board tab (active sprint).
- If new user: board is pre-created with default statuses, show a one-time tooltip: "Create your first epic to get started."

---

## Color & Visual Language

- Minimal. White/gray background, cards are white with subtle shadow.
- Color used sparingly and meaningfully:
  - Epic labels: user-chosen color per epic (displayed as colored chip)
  - Priority: P0=red, P1=orange, P2=yellow, P3=blue, P4=gray
  - Deadline overdue: red text/icon
  - Time-in-status warning: amber if >3 days in non-done status (configurable later)
- Dark mode: yes, from day one. Respect system preference.

---

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| <768px | Mobile: bottom tabs, stacked/swipeable board, FAB |
| 768–1024px | Tablet: side-by-side columns, bottom tabs |
| >1024px | Desktop: sidebar nav, full horizontal board, keyboard shortcuts |

---

## Interaction: Creating an Item

**Mobile flow:**
1. Tap FAB (+)
2. Bottom sheet slides up: Title field (auto-focused, keyboard opens)
3. Type title, hit enter → item created in initial status, current sprint (or backlog)
4. Optional: expand to set priority, epic, estimate, deadline
5. Epic is required before moving to active status — prompt if user tries to move without one

**Desktop flow:**
1. Press N or click "+ New Item" in column header
2. Inline card appears at top of initial-status column
3. Type title, Enter to save
4. Click card to expand and fill details

---

## Interaction: Drag-and-Drop (Status Transition)

**Desktop**: Classic drag. Pick up card, drop on new column. Optimistic UI — card moves immediately, API call fires async. On failure: card snaps back + error toast.

**Mobile**: Long-press card (haptic feedback), then drag. OR tap card → detail view → "Move to" button → action sheet with status options.

---

## Performance Targets

- First meaningful paint: <1.5s
- Board render (50 items): <200ms
- Drag response: <16ms (60fps)
- API latency (p95): <200ms

---

## Open UX Questions (decide during implementation)

1. Board mobile layout: swipeable columns (Trello-style) vs collapsible accordion? Prototype both.
2. Should the FAB create an item in the active sprint or backlog? Leaning sprint (faster flow).
3. Epic creation flow — inline from item detail or separate screen?
4. Toast vs inline for validation errors ("must assign epic before moving")?
