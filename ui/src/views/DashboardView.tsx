import { useTheme } from '../context/ThemeContext'
import { useBoard } from '../context/BoardContext'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'
import { StatCard } from '../components/StatCard'

export function DashboardView() {
  const { isDark } = useTheme()
  const { items, statuses, epics, board } = useBoard()

  const totalItems = items.length
  const doneItems = items.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done).length
  const spilledItems = items.filter((i) => i.sprints.length > 1).length
  const totalEstimate = items.reduce((sum, i) => sum + (i.estimate_minutes || 0), 0)
  const doneEstimate = items.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done).reduce((sum, i) => sum + (i.estimate_minutes || 0), 0)

  const availableMinutes = board.available_hours_per_sprint * 60
  const targetCapacity = availableMinutes * 0.8
  const capacityUsed = Math.round((totalEstimate / targetCapacity) * 100)
  const bufferUsed = Math.max(0, totalEstimate - targetCapacity)
  const bufferTotal = availableMinutes * 0.2

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <section>
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Sprint Capacity (80/20)</h2>
        <div className={`rounded-lg p-4 border ${isDark ? 'bg-[#1e1f25] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[12px] font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Planned vs Target (80%)</span>
            <span className={`text-[13px] font-bold ${capacityUsed > 100 ? 'text-red-500' : capacityUsed > 80 ? 'text-amber-500' : 'text-green-500'}`}>
              {capacityUsed}%
            </span>
          </div>
          <div className={`h-3 rounded-full overflow-hidden relative ${isDark ? 'bg-[#2e303a]' : 'bg-gray-100'}`}>
            <div className="absolute left-[80%] top-0 bottom-0 w-0.5 bg-gray-400 z-10" />
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min(capacityUsed, 100)}%`,
              backgroundColor: capacityUsed > 100 ? '#dc2626' : capacityUsed > 80 ? '#f59e0b' : '#22c55e'
            }} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {formatEstimate(totalEstimate)} planned of {formatEstimate(Math.round(targetCapacity))} target
            </span>
            <span className={`text-[11px] ${bufferUsed > 0 ? 'text-amber-500' : isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Buffer: {formatEstimate(Math.round(Math.max(0, bufferTotal - bufferUsed)))} remaining
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Sprint Health</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Completion" value={`${totalItems ? Math.round((doneItems / totalItems) * 100) : 0}%`} sub={`${doneItems}/${totalItems} items`} />
          <StatCard label="Spillover Rate" value={`${totalItems ? Math.round((spilledItems / totalItems) * 100) : 0}%`} sub={`${spilledItems} items spilled`} />
          <StatCard label="Hours Planned" value={formatEstimate(totalEstimate)} sub="this sprint" />
          <StatCard label="Hours Done" value={formatEstimate(doneEstimate)} sub={`${totalEstimate ? Math.round((doneEstimate / totalEstimate) * 100) : 0}% of planned`} />
        </div>
      </section>

      <section>
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Epic Progress</h2>
        <div className="space-y-2">
          {epics.map((epic) => {
            const epicItems = items.filter((i) => i.epic_name === epic.name)
            const epicDone = epicItems.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done)
            const epicTotal = epicItems.reduce((s, i) => s + (i.estimate_minutes || 0), 0)
            const epicDoneEst = epicDone.reduce((s, i) => s + (i.estimate_minutes || 0), 0)
            const progress = epicTotal ? Math.round((epicDoneEst / epicTotal) * 100) : 0
            const daysLeft = epic.deadline ? Math.ceil((new Date(epic.deadline).getTime() - Date.now()) / 86400000) : null

            return (
              <div key={epic.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isDark ? 'bg-[#1e1f25] border border-[#2e303a]' : 'bg-white border border-gray-200'}`}>
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
                <span className={`text-[12px] font-medium w-32 shrink-0 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{epic.name}</span>
                <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-[#2e303a]' : 'bg-gray-100'}`}>
                  <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: epic.color }} />
                </div>
                <span className={`text-[11px] font-semibold w-10 text-right ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{progress}%</span>
                {daysLeft !== null && (
                  <span className={`text-[11px] w-16 text-right ${daysLeft < 7 ? 'text-red-500 font-medium' : isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {daysLeft > 0 ? `${daysLeft}d left` : 'Overdue'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Stale Items (&gt;2 days in status)</h2>
        <div className="space-y-2">
          {items.filter((i) => i.time_in_status_minutes > 2880 && !statuses.find((s) => s.id === i.status_id)?.is_done).map((item) => (
            <div key={item.id} className={`flex items-center justify-between px-4 py-3 rounded-lg ${isDark ? 'bg-[#1e1f25] border border-[#2e303a]' : 'bg-white border border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <span className={`text-[12px] font-mono font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.display_id}</span>
                <span className={`text-[12px] font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{item.title}</span>
              </div>
              <div className="w-28"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Suggested Dashboards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { name: 'Weekly Velocity', desc: 'Hours completed per sprint over time. Spot trends in your output.', icon: '📈' },
            { name: 'Estimate Accuracy', desc: 'Planned vs actual. Are you overestimating or underestimating?', icon: '🎯' },
            { name: 'Focus Distribution', desc: 'Time split across epics. Where is your energy actually going?', icon: '🔮' },
            { name: 'Spillover Heatmap', desc: 'Which items/epics spill most? Identify chronic blockers.', icon: '🔥' },
          ].map((d) => (
            <div key={d.name} className={`rounded-lg p-4 border cursor-pointer transition-colors ${
              isDark ? 'bg-[#1e1f25] border-[#2e303a] hover:border-indigo-500/30' : 'bg-white border-gray-200 hover:border-indigo-300'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{d.icon}</span>
                <span className={`text-[12px] font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{d.name}</span>
              </div>
              <p className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{d.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
