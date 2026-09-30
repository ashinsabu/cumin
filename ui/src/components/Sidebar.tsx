import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import type { NavEntry } from '../types'

type SidebarProps = {
  views: NavEntry[]
  activeId: string
  onNavigate: (id: string) => void
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
      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-11 w-11 object-contain" />
          <span className="text-base font-bold tracking-tight text-ink">cumin</span>
        </div>
      </div>
      <nav className="flex-1 px-2">
        {views.map((nav) => (
          <button key={nav.id} onClick={() => onNavigate(nav.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--c-radius-card)] text-sm font-medium mb-0.5 transition-colors ${
              activeId === nav.id
                ? 'bg-accent/10 text-accent'
                : 'text-dim hover:bg-surface hover:text-ink'
            }`}>
            <span className="text-sm">{nav.icon}</span>{nav.label}
          </button>
        ))}
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
  const { user } = useAuth()

  const initials = user?.display_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??'

  return (
    <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30" />
      <aside className="fixed left-0 top-0 bottom-0 w-[220px] border-r bg-panel border-line" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-4 flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-11 w-11 object-contain" />
          <span className="text-base font-bold tracking-tight text-ink">cumin</span>
        </div>
        <nav className="px-2">
          {views.map((nav) => (
            <button key={nav.id} onClick={() => { onNavigate(nav.id); onClose() }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--c-radius-card)] text-sm font-medium mb-0.5 transition-colors ${
                activeId === nav.id ? 'bg-accent/10 text-accent' : 'text-dim hover:bg-surface'
              }`}><span>{nav.icon}</span>{nav.label}</button>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 px-3 py-3 border-t border-line">
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
