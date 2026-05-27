import { useTheme } from '../context/ThemeContext'
import { formatDuration } from '../hooks/useFormat'

export function StatusDurationBar({ minutes }: { minutes: number }) {
  const { isDark } = useTheme()
  const days = minutes / 1440

  let color = '#22c55e'
  let width = Math.min(days * 10, 100)
  if (days > 7) { color = '#dc2626'; width = 100 }
  else if (days > 3) { color = '#f97316'; width = Math.min(days * 12, 100) }
  else if (days > 1) { color = '#eab308'; width = Math.min(days * 20, 100) }
  else { width = Math.max(days * 30, 8) }

  return (
    <div className="flex items-center gap-2 w-full">
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-[#2e303a]' : 'bg-gray-200'}`}>
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] font-semibold shrink-0" style={{ color }}>
        {formatDuration(minutes)}
      </span>
    </div>
  )
}
