import type React from 'react'
import type { Item } from '../types'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from './StatusDurationBar'

export function ItemCard({ item }: { item: Item }) {
  const isOverdue = item.deadline && new Date(item.deadline) < new Date()
  const priority = PRIORITY[item.priority] ?? PRIORITY[4]
  const sprints = item.sprints ?? []
  const spillCount = sprints.length - 1
  const epicColor = item.epic_color ?? '#6b7280'
  const epicName = item.epic_name ?? '—'

  const spillBorder = spillCount >= 3 ? 'border-l-red-500' : spillCount === 2 ? 'border-l-amber-400' : spillCount === 1 ? 'border-l-gray-400' : 'border-l-transparent'

  const epicStyle: React.CSSProperties = item.epic_color ? {
    backgroundColor: `${item.epic_color}1a`,
    boxShadow: `0 0 0 1px ${item.epic_color}35`,
  } : {}

  return (
    <div
      style={epicStyle}
      className={`rounded-[var(--c-radius-card)] p-2.5 transition-all cursor-pointer border-l-[3px] ${spillBorder} bg-surface border border-line hover:border-accent/30`}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-sm font-extrabold px-1.5 py-0.5 rounded shrink-0 leading-none mt-0.5" style={{ backgroundColor: priority.bg, color: priority.color }}>
          {priority.label}
        </span>
        <p className="text-sm font-medium leading-tight text-ink">
          {item.title}
        </p>
      </div>

      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        {item.epic_name && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: epicColor + '18', color: epicColor, border: `1px solid ${epicColor}30` }}>
            {epicName.toUpperCase()}
          </span>
        )}
        {isOverdue && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">⚠ {item.deadline}</span>
        )}
      </div>

      <div className="mb-1.5">
        <StatusDurationBar minutes={item.time_in_status_minutes} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {item.estimate_minutes && (
            <span className="text-xs font-semibold text-ink/80">
              {formatEstimate(item.estimate_minutes)}
            </span>
          )}
          {spillCount > 0 && (
            <span className={`text-xs font-medium px-1 py-0.5 rounded ${
              spillCount >= 3 ? 'bg-red-500/10 text-red-400' : spillCount === 2 ? 'bg-amber-500/10 text-amber-400' : 'bg-line text-dim'
            }`}>↻{spillCount}</span>
          )}
        </div>
        <span className="text-xs font-mono font-medium text-dim">
          {item.display_id}
        </span>
      </div>
    </div>
  )
}
