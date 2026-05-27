import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'

export function EpicsView() {
  const { isDark } = useTheme()
  const { items, statuses, epics, selectItem } = useBoard()
  const [expandedEpic, setExpandedEpic] = useState<string | null>(null)

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-3">
        {epics.map((epic) => {
          const epicItems = items.filter((i) => i.epic_name === epic.name)
          const doneItems = epicItems.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done)
          const totalEstimate = epicItems.reduce((s, i) => s + (i.estimate_minutes || 0), 0)
          const doneEstimate = doneItems.reduce((s, i) => s + (i.estimate_minutes || 0), 0)
          const progress = totalEstimate ? Math.round((doneEstimate / totalEstimate) * 100) : 0
          const isExpanded = expandedEpic === epic.id
          const daysUntilDeadline = epic.deadline ? Math.ceil((new Date(epic.deadline).getTime() - Date.now()) / 86400000) : null

          return (
            <div key={epic.id} className={`rounded-lg border overflow-hidden ${isDark ? 'bg-[#1e1f25] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
              <div
                className={`px-4 py-3 cursor-pointer transition-colors ${isDark ? 'hover:bg-[#252630]' : 'hover:bg-gray-50'}`}
                onClick={() => setExpandedEpic(isExpanded ? null : epic.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[12px]">{isExpanded ? '▾' : '▸'}</span>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: epic.color }} />
                    <span className={`text-[13px] font-semibold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{epic.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${
                      epic.type === 'recurring' ? 'bg-green-50 text-green-700 border border-green-200' :
                      epic.type === 'goal' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                      'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}>{epic.type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {daysUntilDeadline !== null && (
                      <span className={`text-[11px] font-medium ${daysUntilDeadline < 7 ? 'text-red-500' : daysUntilDeadline < 14 ? 'text-amber-500' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {daysUntilDeadline > 0 ? `${daysUntilDeadline}d left` : 'Overdue'}
                      </span>
                    )}
                    <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {doneItems.length}/{epicItems.length} items
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-[#2e303a]' : 'bg-gray-100'}`}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: epic.color }} />
                  </div>
                  <span className={`text-[11px] font-semibold shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {progress}% · {formatEstimate(doneEstimate)}/{formatEstimate(totalEstimate)}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className={`border-t ${isDark ? 'border-[#2e303a]' : 'border-gray-100'}`}>
                  {epic.description && (
                    <p className={`px-4 py-2 text-[12px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{epic.description}</p>
                  )}
                  {epicItems.length === 0 ? (
                    <p className={`px-4 py-3 text-[12px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No items yet</p>
                  ) : (
                    <div className={`divide-y ${isDark ? 'divide-[#2e303a]' : 'divide-gray-100'}`}>
                      {epicItems.map((item) => {
                        const priority = PRIORITY[item.priority]
                        const status = statuses.find((s) => s.id === item.status_id)
                        return (
                          <div
                            key={item.id}
                            onClick={(e) => { e.stopPropagation(); selectItem(item) }}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isDark ? 'hover:bg-[#252630]' : 'hover:bg-gray-50'}`}
                          >
                            <span className="text-[11px] font-bold" style={{ color: priority.color }}>{priority.label}</span>
                            <span className={`text-[12px] font-mono font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.display_id}</span>
                            <span className={`text-[12px] font-medium flex-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{item.title}</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                              status?.is_done ? 'bg-green-50 text-green-700' : isDark ? 'bg-[#2e303a] text-gray-300' : 'bg-gray-100 text-gray-600'
                            }`}>{status?.name}</span>
                            <span className={`text-[11px] font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                              {item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className={`px-4 py-2.5 border-t ${isDark ? 'border-[#2e303a]' : 'border-gray-100'}`}>
                    <button className={`text-[12px] font-medium ${isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'}`}>
                      + Add item
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
