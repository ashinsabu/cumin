import type { Item } from '../types'
import { useTheme } from '../context/ThemeContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from './StatusDurationBar'

export function ItemCard({ item }: { item: Item }) {
  const { isDark } = useTheme()
  const isOverdue = item.deadline && new Date(item.deadline) < new Date()
  const priority = PRIORITY[item.priority]
  const spillCount = item.sprints.length - 1

  const spillBorder = spillCount >= 3 ? 'border-l-red-500' : spillCount === 2 ? 'border-l-amber-400' : spillCount === 1 ? 'border-l-gray-400' : 'border-l-transparent'

  return (
    <div className={`rounded-md p-2.5 transition-all cursor-pointer border-l-[3px] ${spillBorder} ${
      isDark
        ? 'bg-[#1e1f25] border border-[#2e303a] hover:border-[#404250]'
        : 'bg-white border border-gray-200 hover:shadow-md'
    }`}>
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-[12px] font-extrabold px-1.5 py-0.5 rounded shrink-0 leading-none mt-0.5" style={{ backgroundColor: priority.bg, color: priority.color }}>
          {priority.label}
        </span>
        <p className={`text-[12px] font-medium leading-tight ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
          {item.title}
        </p>
      </div>

      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: item.epic_color + '18', color: item.epic_color, border: `1px solid ${item.epic_color}30` }}>
          {item.epic_name.toUpperCase()}
        </span>
        {isOverdue && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">⚠ {item.deadline}</span>
        )}
      </div>

      <div className="mb-1.5">
        <StatusDurationBar minutes={item.time_in_status_minutes} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {item.estimate_minutes && (
            <span className={`text-[11px] font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              {formatEstimate(item.estimate_minutes)}
            </span>
          )}
          {spillCount > 0 && (
            <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${
              spillCount >= 3 ? 'bg-red-50 text-red-500' : spillCount === 2 ? 'bg-amber-50 text-amber-500' : isDark ? 'bg-[#2e303a] text-gray-400' : 'bg-gray-100 text-gray-400'
            }`}>↻{spillCount}</span>
          )}
        </div>
        <span className={`text-[10px] font-mono font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {item.display_id}
        </span>
      </div>
    </div>
  )
}
