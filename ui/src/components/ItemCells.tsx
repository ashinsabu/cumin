import { useState } from 'react'
import { useUpdateItem } from '../hooks/useItems'
import { useEpics } from '../hooks/useEpics'
import { parseEstimate, formatEstimate } from '../hooks/useFormat'
import { PRIORITY } from '../constants'
import { FilterSelect } from './FilterSelect'
import type { Item } from '../types'

// Inline-editable cells for the Items table. Every cell saves on its own via PATCH /api/items/:id,
// mirroring the payload shapes ItemModal uses (clear_epic / clear_sprint to unset).
// Clicks are stopped from bubbling so editing never opens the item modal.

const stop = (e: React.SyntheticEvent) => e.stopPropagation()

function InlineText({ value, display, placeholder, validate, onSave, className }: {
  value: string
  display: string
  placeholder?: string
  validate?: (raw: string) => boolean
  onSave: (raw: string) => void
  className: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [invalid, setInvalid] = useState(false)

  function commit() {
    const trimmed = draft.trim()
    if (trimmed === value.trim()) { setEditing(false); setInvalid(false); return }
    if (validate && !validate(trimmed)) { setInvalid(true); return }
    setEditing(false); setInvalid(false)
    onSave(trimmed)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); setDraft(value); setEditing(true) }}
        className={`${className} text-left w-full truncate rounded hover:bg-line/40 px-1 -mx-1`}
        title="Click to edit"
      >
        {display}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onClick={stop}
      onChange={(e) => { setDraft(e.target.value); setInvalid(false) }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setEditing(false); setInvalid(false) }
      }}
      className={`${className} w-full bg-canvas border rounded px-1 -mx-1 outline-none ${invalid ? 'border-red-500' : 'border-accent/60'}`}
    />
  )
}

export function TitleCell({ item }: { item: Item }) {
  const update = useUpdateItem()
  return (
    <InlineText
      value={item.title}
      display={item.title}
      className="text-sm font-medium text-ink leading-snug"
      validate={(raw) => raw.length > 0}
      onSave={(title) => update.mutate({ id: item.id, payload: { title } })}
    />
  )
}

export function EstimateCell({ item }: { item: Item }) {
  const update = useUpdateItem()
  return (
    <InlineText
      value={item.estimate_minutes ? formatEstimate(item.estimate_minutes) : ''}
      display={item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}
      placeholder="2h, 30m"
      className="text-sm font-semibold text-ink/80"
      validate={(raw) => raw === '' || parseEstimate(raw) !== null}
      onSave={(raw) => update.mutate({ id: item.id, payload: { estimate_minutes: raw ? parseEstimate(raw) : null } })}
    />
  )
}

export function PriorityCell({ item }: { item: Item }) {
  const update = useUpdateItem()
  const options = ([0, 1, 2, 3, 4] as const).map((p) => ({ value: String(p), label: PRIORITY[p].label, color: PRIORITY[p].color }))
  return (
    <div onClick={stop}>
      <FilterSelect
        variant="cell"
        value={String(item.priority)}
        options={options}
        onChange={(v) => update.mutate({ id: item.id, payload: { priority: Number(v) } })}
      />
    </div>
  )
}

const NO_EPIC = '__none__'

export function EpicCell({ item }: { item: Item }) {
  const update = useUpdateItem()
  const { data: epics = [] } = useEpics()
  const options = [{ value: NO_EPIC, label: 'No epic' }, ...epics.map((e) => ({ value: e.id, label: e.name, color: e.color }))]
  return (
    <div onClick={stop}>
      <FilterSelect
        variant="cell"
        value={item.epic_id ?? NO_EPIC}
        options={options}
        onChange={(v) => update.mutate({ id: item.id, payload: v === NO_EPIC ? { clear_epic: true } : { epic_id: v } })}
      />
    </div>
  )
}
