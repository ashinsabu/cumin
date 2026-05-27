import { useState } from 'react'
import { useTheme } from './context/ThemeContext'
import { useBoard } from './context/BoardContext'
import { Sidebar, MobileNav } from './components/Sidebar'
import { ItemModal } from './components/ItemModal'
import { BoardView } from './views/BoardView'
import { BacklogView } from './views/BacklogView'
import { AllItemsView } from './views/AllItemsView'
import { EpicsView } from './views/EpicsView'
import { DashboardView } from './views/DashboardView'
import { formatEstimate } from './hooks/useFormat'
import type { NavEntry } from './types'

const NAV_VIEWS: NavEntry[] = [
  { id: 'board', label: 'Board', icon: '▦', component: BoardView },
  { id: 'backlog', label: 'Backlog', icon: '☰', component: BacklogView },
  { id: 'all-items', label: 'All Items', icon: '⊞', component: AllItemsView },
  { id: 'epics', label: 'Epics', icon: '◎', component: EpicsView },
  { id: 'dashboards', label: 'Dashboards', icon: '◩', component: DashboardView },
]

export default function App() {
  const { isDark } = useTheme()
  const { items, activeSprint, selectedItem, selectItem } = useBoard()
  const [activeNav, setActiveNav] = useState('board')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const ActiveView = NAV_VIEWS.find((v) => v.id === activeNav)?.component ?? BoardView

  return (
    <div className={`h-screen flex ${isDark ? 'bg-[#111218]' : 'bg-[#f8f9fc]'}`}>
      <Sidebar views={NAV_VIEWS} activeId={activeNav} onNavigate={setActiveNav} />

      {mobileNavOpen && (
        <MobileNav views={NAV_VIEWS} activeId={activeNav} onNavigate={setActiveNav} onClose={() => setMobileNavOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${isDark ? 'bg-[#16171d] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className={`md:hidden p-1.5 rounded-md ${isDark ? 'text-gray-400 hover:bg-[#2e303a]' : 'text-gray-500 hover:bg-gray-100'}`}>☰</button>
            <span className={`text-[12px] font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{NAV_VIEWS.find((n) => n.id === activeNav)?.label}</span>
          </div>
          <div className={`text-[11px] px-2.5 py-1.5 rounded-md ${isDark ? 'bg-[#2e303a] text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
            {activeSprint.name} · {activeSprint.start_date.slice(5)} – {activeSprint.end_date.slice(5)} · <span className="font-semibold">{items.length} items · {formatEstimate(items.reduce((s, i) => s + (i.estimate_minutes || 0), 0))} planned</span>
          </div>
        </header>

        <ActiveView />
      </div>

      {selectedItem && <ItemModal item={selectedItem} onClose={() => selectItem(null)} />}
    </div>
  )
}
