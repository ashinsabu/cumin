import { useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useBoard } from './context/BoardContext'
import { Sidebar, MobileNav } from './components/Sidebar'
import { ItemModal } from './components/ItemModal'
import { LoginPage } from './components/LoginPage'
import { AuthErrorPage } from './components/AuthErrorPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BoardView } from './views/BoardView'
import { BacklogView } from './views/BacklogView'
import { AllItemsView } from './views/AllItemsView'
import { EpicsView } from './views/EpicsView'
import { ProjectsView } from './views/ProjectsView'
import { DashboardView } from './views/DashboardView'
import { AccountView } from './views/AccountView'
import { formatEstimate } from './hooks/useFormat'
import type { NavEntry } from './types'

const NAV_VIEWS: NavEntry[] = [
  { id: 'board', path: '/', label: 'Board', icon: '▦' },
  { id: 'backlog', path: '/backlog', label: 'Backlog', icon: '☰' },
  { id: 'all-items', path: '/items', label: 'All Items', icon: '⊞' },
  { id: 'epics', path: '/epics', label: 'Epics', icon: '◎' },
  { id: 'projects', path: '/projects', label: 'Projects', icon: '▣' },
  { id: 'dashboards', path: '/dashboards', label: 'Dashboards', icon: '◩' },
]


function AppShell() {
  const { user, loading } = useAuth()
  const { items, activeSprint, selectedItem, selectItem } = useBoard()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas">
        <span className="text-sm text-dim">Loading...</span>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  const activeId = location.pathname === '/account' ? 'account' : (NAV_VIEWS.find((v) => v.path === location.pathname)?.id ?? 'board')
  const activeLabel = NAV_VIEWS.find((v) => v.path === location.pathname)?.label ?? (location.pathname === '/account' ? 'Account' : 'Board')

  const handleNavigate = (id: string) => {
    if (id === 'account') {
      navigate('/account')
    } else {
      const view = NAV_VIEWS.find((v) => v.id === id)
      if (view) navigate(view.path)
    }
  }

  return (
    <div className="h-screen flex bg-canvas">
      <Sidebar views={NAV_VIEWS} activeId={activeId} onNavigate={handleNavigate} />

      {mobileNavOpen && (
        <MobileNav views={NAV_VIEWS} activeId={activeId} onNavigate={(id) => { handleNavigate(id); setMobileNavOpen(false) }} onClose={() => setMobileNavOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 bg-surface border-line">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-1.5 rounded-[var(--c-radius-card)] text-dim hover:bg-line">☰</button>
            <span className="text-sm font-semibold text-ink">{activeLabel}</span>
          </div>
          {activeId !== 'account' && (
            <div className="text-xs px-2.5 py-1.5 rounded-[var(--c-radius-card)] bg-line text-dim">
              {activeSprint
                ? <>{activeSprint.name} · {activeSprint.start_date.slice(5)} – {activeSprint.end_date.slice(5)} · <span className="font-semibold text-ink/80">{items.length} items · {formatEstimate(items.reduce((s, i) => s + (i.estimate_minutes || 0), 0))} planned</span></>
                : <span className="font-semibold">No active sprint</span>}
            </div>
          )}
        </header>

        <ErrorBoundary fallback={
          <div className="flex-1 flex items-center justify-center flex-col gap-2 text-dim">
            <span className="text-sm font-medium">This view crashed.</span>
            <button onClick={() => window.location.reload()} className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90">Reload</button>
          </div>
        }>
          <Routes>
            <Route path="/" element={<BoardView />} />
            <Route path="/backlog" element={<BacklogView />} />
            <Route path="/items" element={<AllItemsView />} />
            <Route path="/epics" element={<EpicsView />} />
            <Route path="/projects" element={<ProjectsView />} />
            <Route path="/dashboards" element={<DashboardView />} />
            <Route path="/account" element={<AccountView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>

      {selectedItem && <ItemModal item={selectedItem} onClose={() => selectItem(null)} />}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth-error" element={<AuthErrorPage />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  )
}
