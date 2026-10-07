import { formatDuration } from '../hooks/useFormat'

// When estimate is provided, width = time_in_status / estimate (capped at 100%).
// Color thresholds: <50% green, 50-80% yellow, 80-100% orange, >100% red.
// Without estimate, falls back to an 8h absolute scale.
export function StatusDurationBar({ minutes, estimateMinutes }: { minutes: number | undefined; estimateMinutes?: number | null }) {
  if (minutes == null) {
    return <span className="text-xs text-ghost">—</span>
  }

  let color: string
  let width: number

  if (estimateMinutes && estimateMinutes > 0) {
    const ratio = minutes / estimateMinutes
    width = Math.min(ratio * 100, 100)
    if (ratio >= 1) color = '#dc2626'
    else if (ratio >= 0.8) color = '#f97316'
    else if (ratio >= 0.5) color = '#eab308'
    else color = '#22c55e'
  } else {
    // Fallback: scale against 8h workday
    const hours = minutes / 60
    if (hours > 24) { color = '#dc2626'; width = 100 }
    else if (hours > 8) { color = '#f97316'; width = Math.min(50 + ((hours - 8) / 16) * 50, 100) }
    else if (hours > 2) { color = '#eab308'; width = Math.min(25 + ((hours - 2) / 6) * 25, 50) }
    else { color = '#22c55e'; width = minutes === 0 ? 0 : Math.max((hours / 2) * 25, 3) }
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full overflow-hidden bg-line">
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className={`text-sm font-bold shrink-0 ${minutes === 0 ? 'text-ghost' : ''}`} style={minutes > 0 ? { color } : undefined}>
        {formatDuration(minutes)}
      </span>
    </div>
  )
}
