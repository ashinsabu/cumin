import type { Item } from '../types'
import { useBoard } from '../context/BoardContext'
import { useAuth } from '../context/AuthContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from './StatusDurationBar'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-dim">{label}</span>
      {children}
    </div>
  )
}

export function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { statuses, moveItem } = useBoard()
  const { user } = useAuth()
  const priority = PRIORITY[item.priority] ?? PRIORITY[4]
  const isOverdue = item.deadline && new Date(item.deadline) < new Date()
  const sprints = item.sprints ?? []
  const epicColor = item.epic_color ?? '#6b7280'

  const initials = user?.display_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?'

  function handleStatusChange(newStatusId: string) {
    if (newStatusId !== item.status_id) {
      moveItem(item.id, newStatusId)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-[var(--c-radius-card)] shadow-xl overflow-hidden bg-raised border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold px-2 py-0.5 rounded" style={{ backgroundColor: priority.bg, color: priority.color }}>{priority.label}</span>
              <span className="text-sm font-mono font-medium text-dim">{item.display_id}</span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[var(--c-radius-card)] transition-colors hover:bg-line text-dim">✕</button>
          </div>
          <h2 className="text-base font-semibold mt-2 text-ink">{item.title}</h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          <Row label="Status">
            <div className="flex items-center gap-1.5">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleStatusChange(s.id)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
                    s.id === item.status_id
                      ? s.is_done
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-accent/15 text-accent border border-accent/30'
                      : 'bg-line text-dim hover:text-ink hover:bg-raised'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Epic">
            {item.epic_name
              ? <span className="text-xs font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: epicColor + '18', color: epicColor, border: `1px solid ${epicColor}30` }}>{item.epic_name}</span>
              : <span className="text-xs text-ghost">—</span>
            }
          </Row>
          <Row label="Estimate">
            <span className="text-sm font-semibold text-ink/80">{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
          </Row>
          <Row label="Time in status">
            <div className="w-40"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
          </Row>
          <Row label="Deadline">
            <span className={`text-sm ${isOverdue ? 'text-red-500 font-semibold' : 'text-ink/80'}`}>
              {item.deadline ? `${item.deadline}${isOverdue ? ' (overdue)' : ''}` : '—'}
            </span>
          </Row>
          {sprints.length > 0 && (
            <Row label="Sprints">
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {sprints.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-line text-dim">{s}</span>
                ))}
              </div>
            </Row>
          )}
        </div>

        <div className="px-6 py-3 border-t border-line flex items-center justify-between bg-panel">
          <span className="text-xs text-ghost">
            {sprints.length > 1 ? `Spilled ${sprints.length - 1}×` : 'No spillover'}
          </span>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center text-white text-xs font-bold">{initials}</div>
        </div>
      </div>
    </div>
  )
}
