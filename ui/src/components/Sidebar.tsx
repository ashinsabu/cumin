import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useSavedViews, useDeleteView } from '../hooks/useSavedViews'
import { useProjects } from '../hooks/useProjects'
import { useSelectedProject } from '../hooks/useSelectedProject'
import type { NavEntry, Project } from '../types'

type SidebarProps = {
  views: NavEntry[]
  activeId: string
  onNavigate: (id: string) => void
}

const NAV_GROUPS = [
  { label: null,       ids: ['board', 'items', 'sprints'] },
  { label: 'Organize', ids: ['epics'] },
  { label: 'Insights', ids: ['dashboards'] },
]

function ProjectSwitcher({
  projects,
  currentId,
  onSelect,
  onClose,
  onNewProject,
}: {
  projects: Project[]
  currentId: string
  onSelect: (id: string) => void
  onClose: () => void
  onNewProject: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-2 right-2 top-full mt-1 z-50 bg-raised border border-line rounded-[var(--c-radius-card)] shadow-lg py-1"
    >
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => { onSelect(p.id); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-surface transition-colors"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#6b7280' }} />
          <span className="flex-1 truncate text-ink">{p.name}</span>
          {p.id === currentId && <span className="text-accent text-xs">✓</span>}
        </button>
      ))}
      <div className="border-t border-line/50 mt-1 pt-1">
        <button
          onClick={() => { onNewProject(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-dim hover:bg-surface hover:text-ink transition-colors"
        >
          <span className="text-xs opacity-60">⚙</span>
          <span>Manage projects</span>
        </button>
      </div>
    </div>
  )
}

function ProjectHeader({
  onNavigate,
}: {
  onNavigate: (id: string) => void
}) {
  const { data: projects = [] } = useProjects()
  const [current, setSelectedId] = useSelectedProject()
  const [showSwitcher, setShowSwitcher] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} className="relative px-4 pt-4 pb-3">
      {/* App identity row */}
      <div className="flex items-center gap-2 mb-2.5">
        <img src="/logo.png" alt="" className="h-8 w-8 object-contain shrink-0" />
        <span className="text-base font-bold tracking-tight text-ink">cumin</span>
      </div>
      {/* Project context row */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-ghost/50 shrink-0">Project</span>
        <button
          onClick={() => setShowSwitcher((s) => !s)}
          className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-[var(--c-radius-card)] transition-colors hover:bg-surface cursor-pointer"
        >
          {current && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: current.color || '#6b7280' }} />
          )}
          <span className="text-sm font-medium text-ink truncate flex-1 text-left">
            {current?.name ?? '…'}
          </span>
          <svg width="9" height="5" viewBox="0 0 10 6" fill="none" className={`transition-transform shrink-0 text-ghost/50 ${showSwitcher ? 'rotate-180' : ''}`}>
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {showSwitcher && (
        <ProjectSwitcher
          projects={projects}
          currentId={current?.id ?? ''}
          onSelect={setSelectedId}
          onClose={() => setShowSwitcher(false)}
          onNewProject={() => onNavigate('projects')}
        />
      )}
    </div>
  )
}

function ViewsSection({ activeId }: { activeId: string }) {
  const { data: savedViews = [] } = useSavedViews()
  const deleteView = useDeleteView()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  if (savedViews.length === 0) return null

  const activeViewId = searchParams.get('view')

  function loadView(v: typeof savedViews[0]) {
    const params = new URLSearchParams()
    params.set('view', v.id)
    if (v.filters.project_id) params.set('project_id', v.filters.project_id)
    if (v.filters.epic_id)    params.set('epic_id',    v.filters.epic_id)
    if (v.filters.status_id)  params.set('status_id',  v.filters.status_id)
    if (v.filters.priority !== undefined) params.set('priority', String(v.filters.priority))
    if (v.filters.hide_done)  params.set('hide_done',  'true')
    navigate(`/items?${params.toString()}`)
  }

  return (
    <div>
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-ghost/60">My Views</p>
      {savedViews.map((v) => (
        <div
          key={v.id}
          className="group relative"
          onMouseEnter={() => setHoveredId(v.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <button
            onClick={() => loadView(v)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--c-radius-card)] text-sm font-medium mb-0.5 transition-colors pr-8 ${
              activeViewId === v.id && activeId === 'items'
                ? 'nav-item-active bg-accent/10 text-accent'
                : 'text-dim hover:bg-surface hover:text-ink'
            }`}
          >
            <span className="text-xs opacity-60">▤</span>
            <span className="flex-1 text-left truncate">{v.name}</span>
          </button>
          {hoveredId === v.id && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteView.mutate(v.id) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-ghost/40 hover:text-accent/80 hover:bg-accent/10 transition-colors"
              title="Delete view"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function Sidebar({ views, activeId, onNavigate }: SidebarProps) {
  const { isDark, toggle } = useTheme()
  const { user } = useAuth()

  const initials = user?.display_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??'

  return (
    <aside className="hidden md:flex flex-col w-[200px] shrink-0 border-r bg-panel border-line">
      <ProjectHeader onNavigate={onNavigate} />
      <nav className="flex-1 px-2 space-y-3 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-ghost/60">{group.label}</p>
            )}
            {views.filter((v) => group.ids.includes(v.id)).map((nav) => {
              const isPlaceholder = nav.id === 'dashboards'
              return (
                <button key={nav.id}
                  onClick={isPlaceholder ? undefined : () => onNavigate(nav.id)}
                  disabled={isPlaceholder}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--c-radius-card)] text-sm font-medium mb-0.5 transition-colors ${
                    isPlaceholder
                      ? 'text-ghost/40 cursor-default'
                      : activeId === nav.id
                        ? 'nav-item-active bg-accent/10 text-accent'
                        : 'text-dim hover:bg-surface hover:text-ink'
                  }`}>
                  <span className="text-sm">{nav.icon}</span>
                  <span className="flex-1 text-left">{nav.label}</span>
                  {isPlaceholder && <span className="text-[9px] font-semibold tracking-wide text-ghost/40 uppercase">soon</span>}
                </button>
              )
            })}
          </div>
        ))}
        <ViewsSection activeId={activeId} />
      </nav>
      <div className="px-3 py-3 border-t border-line">
        <button onClick={toggle}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--c-radius-card)] text-sm font-medium transition-colors text-dim hover:bg-surface">
          <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>{isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={() => onNavigate('account')}
          className={`w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-[var(--c-radius-card)] transition-colors ${
            activeId === 'account' ? 'bg-accent/10' : 'hover:bg-surface'
          }`}
        >
          {user?.avatar_url ? (
            <img src={user.avatar_url} className="w-6 h-6 rounded-full" alt="" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center text-white text-xs font-bold">{initials}</div>
          )}
          <span className="text-sm font-medium text-ink/80">{user?.display_name ?? 'Account'}</span>
        </button>
      </div>
    </aside>
  )
}

export function MobileNav({ views, activeId, onNavigate, onClose }: SidebarProps & { onClose: () => void }) {
  const { data: projects = [] } = useProjects()
  const [current, setSelectedId] = useSelectedProject()
  const { user } = useAuth()
  const [showSwitcher, setShowSwitcher] = useState(false)

  const initials = user?.display_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??'

  return (
    <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30" />
      <aside className="fixed left-0 top-0 bottom-0 w-[220px] border-r bg-panel border-line flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="relative px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain shrink-0" />
            <span className="text-base font-bold tracking-tight text-ink">cumin</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-ghost/50 shrink-0">Project</span>
            <button
              onClick={() => setShowSwitcher((s) => !s)}
              className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-[var(--c-radius-card)] transition-colors hover:bg-surface cursor-pointer"
            >
              {current && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: current.color || '#6b7280' }} />
              )}
              <span className="text-sm font-medium text-ink truncate flex-1 text-left">{current?.name ?? '…'}</span>
              <svg width="9" height="5" viewBox="0 0 10 6" fill="none" className={`transition-transform shrink-0 text-ghost/50 ${showSwitcher ? 'rotate-180' : ''}`}>
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          {showSwitcher && (
            <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-raised border border-line rounded-[var(--c-radius-card)] shadow-lg py-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedId(p.id); setShowSwitcher(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-surface transition-colors"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#6b7280' }} />
                  <span className="flex-1 truncate text-ink">{p.name}</span>
                  {p.id === current?.id && <span className="text-accent text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <nav className="flex-1 px-2 overflow-y-auto">
          {views.map((nav) => (
            <button key={nav.id} onClick={() => { onNavigate(nav.id); onClose() }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--c-radius-card)] text-sm font-medium mb-0.5 transition-colors ${
                activeId === nav.id ? 'nav-item-active bg-accent/10 text-accent' : 'text-dim hover:bg-surface'
              }`}><span>{nav.icon}</span>{nav.label}</button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-line">
          <button onClick={() => { onNavigate('account'); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--c-radius-card)] transition-colors hover:bg-surface">
            {user?.avatar_url ? (
              <img src={user.avatar_url} className="w-6 h-6 rounded-full" alt="" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center text-white text-xs font-bold">{initials}</div>
            )}
            <span className="text-sm font-medium text-ink/80">{user?.display_name ?? 'Account'}</span>
          </button>
        </div>
      </aside>
    </div>
  )
}
