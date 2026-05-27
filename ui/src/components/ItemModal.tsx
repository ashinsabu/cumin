import type { Item } from '../types'
import { useTheme } from '../context/ThemeContext'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from './StatusDurationBar'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { isDark } = useTheme()
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[12px] font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
      {children}
    </div>
  )
}

export function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { isDark } = useTheme()
  const { statuses, moveItem } = useBoard()
  const priority = PRIORITY[item.priority]
  const isOverdue = item.deadline && new Date(item.deadline) < new Date()
  const status = statuses.find((s) => s.id === item.status_id)

  function handleStatusChange(newStatusId: string) {
    if (newStatusId !== item.status_id) {
      moveItem(item.id, newStatusId)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-lg rounded-xl shadow-xl overflow-hidden ${
          isDark ? 'bg-[#1e1f25] border border-[#2e303a]' : 'bg-white border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-6 py-4 border-b ${isDark ? 'border-[#2e303a]' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: priority.bg, color: priority.color }}>{priority.label}</span>
              <span className={`text-[13px] font-mono font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{item.display_id}</span>
            </div>
            <button onClick={onClose} className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-[#2e303a] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>✕</button>
          </div>
          <h2 className={`text-base font-semibold mt-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.title}</h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          <Row label="Status">
            <div className="flex items-center gap-1.5">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleStatusChange(s.id)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded transition-colors ${
                    s.id === item.status_id
                      ? s.is_done
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : isDark ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                      : isDark ? 'bg-[#2e303a] text-gray-400 hover:text-gray-200 hover:bg-[#3e4050]' : 'bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Epic">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: item.epic_color + '18', color: item.epic_color, border: `1px solid ${item.epic_color}30` }}>{item.epic_name}</span>
          </Row>
          <Row label="Estimate">
            <span className={`text-[13px] font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
          </Row>
          <Row label="Time in status">
            <div className="w-40"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
          </Row>
          <Row label="Deadline">
            <span className={`text-[12px] ${isOverdue ? 'text-red-500 font-semibold' : isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              {item.deadline ? `${item.deadline}${isOverdue ? ' (overdue)' : ''}` : '—'}
            </span>
          </Row>
          <Row label="Sprints">
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {item.sprints.map((s) => (
                <span key={s} className={`text-[11px] px-2 py-0.5 rounded ${isDark ? 'bg-[#2e303a] text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{s}</span>
              ))}
            </div>
          </Row>
        </div>

        <div className={`px-6 py-3 border-t flex items-center justify-between ${isDark ? 'border-[#2e303a] bg-[#16171d]' : 'border-gray-100 bg-gray-50'}`}>
          <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {item.sprints.length > 1 ? `Spilled ${item.sprints.length - 1}×` : 'No spillover'}
          </span>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">AS</div>
        </div>
      </div>
    </div>
  )
}
