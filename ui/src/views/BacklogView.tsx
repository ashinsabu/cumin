import { useTheme } from '../context/ThemeContext'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'

export function BacklogView() {
  const { isDark } = useTheme()
  const { items, selectItem } = useBoard()
  const backlogItems = items.filter((i) => i.status_id !== '4').sort((a, b) => a.priority - b.priority)

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-2">
        {backlogItems.map((item) => {
          const priority = PRIORITY[item.priority]
          return (
            <div key={item.id} onClick={() => selectItem(item)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${isDark ? 'bg-[#1e1f25] border border-[#2e303a] hover:border-[#404250]' : 'bg-white border border-gray-200 hover:shadow-sm'}`}>
              <span className="text-[12px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: priority.bg, color: priority.color }}>{priority.label}</span>
              <span className={`text-[13px] font-medium flex-1 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{item.title}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: item.epic_color + '18', color: item.epic_color }}>{item.epic_name}</span>
              <span className={`text-[12px] font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
