import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { PRESETS } from '../themes/index'
import type { Preset } from '../themes/types'

const PRESET_IDS: Preset['id'][] = ['cyber', 'glass', 'minimal']

// ── Trash tab ────────────────────────────────────────────────────────────────

type TrashProject = { id: string; name: string; prefix: string; color: string; deleted_at: string; item_count: number }
type TrashEpic    = { id: string; name: string; color: string; deleted_at: string; item_count: number }

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() + 30 * 86400000 - Date.now()) / 86400000))
}

function RecentlyDeletedSection() {
  const [projects, setProjects] = useState<TrashProject[]>([])
  const [epics, setEpics]       = useState<TrashEpic[]>([])
  const [loading, setLoading]   = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError]       = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/trash', { credentials: 'include' })
      if (res.ok) {
        const d = await res.json()
        setProjects(d.projects ?? [])
        setEpics(d.epics ?? [])
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function restore(type: 'projects' | 'epics', id: string) {
    setRestoring(id); setError('')
    try {
      const res = await fetch(`/api/${type}/${id}/restore`, { method: 'POST', credentials: 'include' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Restore failed') }
      else await load()
    } catch { setError('Network error') }
    finally { setRestoring(null) }
  }

  async function emptyTrash() {
    if (!window.confirm('Permanently delete everything in trash? This cannot be undone.')) return
    await fetch('/api/trash', { method: 'DELETE', credentials: 'include' })
    await load()
  }

  if (loading) return <div className="py-8 text-center text-sm text-ghost">Loading…</div>

  const isEmpty = projects.length === 0 && epics.length === 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-ink">Recently Deleted</h2>
        <p className="text-xs text-ghost mt-0.5">Items are permanently deleted after 30 days.</p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {isEmpty ? (
        <div className="py-10 text-center text-sm text-ghost border border-line rounded-[var(--c-radius-card)]">Nothing in trash.</div>
      ) : (
        <>
          {projects.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ghost mb-2">Projects</p>
              <div className="rounded-[var(--c-radius-card)] border border-line overflow-hidden">
                {projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 bg-surface">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink">{p.name} <span className="font-mono text-xs text-ghost">{p.prefix}</span></div>
                      <div className="text-xs text-ghost mt-0.5">Deleted {timeAgo(p.deleted_at)} · {p.item_count} items · purges in {daysLeft(p.deleted_at)}d</div>
                    </div>
                    <button onClick={() => restore('projects', p.id)} disabled={restoring === p.id}
                      className="text-xs px-2.5 py-1 rounded-[var(--c-radius-card)] border border-line text-dim hover:text-ink hover:border-ghost disabled:opacity-40 transition-colors">
                      {restoring === p.id ? '…' : 'Restore'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {epics.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ghost mb-2">Epics</p>
              <div className="rounded-[var(--c-radius-card)] border border-line overflow-hidden">
                {epics.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 bg-surface">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink">{e.name}</div>
                      <div className="text-xs text-ghost mt-0.5">Deleted {timeAgo(e.deleted_at)} · {e.item_count} items · purges in {daysLeft(e.deleted_at)}d</div>
                    </div>
                    <button onClick={() => restore('epics', e.id)} disabled={restoring === e.id}
                      className="text-xs px-2.5 py-1 rounded-[var(--c-radius-card)] border border-line text-dim hover:text-ink hover:border-ghost disabled:opacity-40 transition-colors">
                      {restoring === e.id ? '…' : 'Restore'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={emptyTrash}
            className="w-full py-2 text-xs font-medium rounded-[var(--c-radius-card)] border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors">
            Empty trash
          </button>
        </>
      )}
    </div>
  )
}

// ── Profile section ───────────────────────────────────────────────────────────

function ProfileSection() {
  const { user } = useAuth()
  if (!user) return null
  const initials = user.display_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-ink">Profile</h2>
      <div className="flex items-center gap-4">
        {user.avatar_url
          ? <img src={user.avatar_url} className="w-14 h-14 rounded-full" alt="" />
          : <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center text-white text-lg font-bold">{initials}</div>}
        <div>
          <p className="text-sm font-semibold text-ink">{user.display_name}</p>
          <p className="text-xs text-dim">{user.email}</p>
        </div>
      </div>
      <div className="border border-line rounded-[var(--c-radius-card)] px-4 py-3 bg-surface">
        <p className="text-xs font-semibold uppercase tracking-wider text-ghost mb-1">ID Prefix</p>
        <p className="text-sm font-mono font-semibold text-ink">{user.id_prefix}</p>
        <p className="text-xs text-ghost mt-0.5">Item IDs: {user.id_prefix}-1, {user.id_prefix}-2, …</p>
      </div>
    </div>
  )
}

// ── Appearance section ────────────────────────────────────────────────────────

function AppearanceSection() {
  const { prefs, setPrefs } = useTheme()
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-ink">Appearance</h2>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ghost mb-2">Theme</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_IDS.map((id) => (
            <button key={id} onClick={() => setPrefs({ ...prefs, preset: id })}
              className={`px-3 py-2 rounded-[var(--c-radius-card)] text-sm font-medium border transition-colors ${
                prefs.preset === id ? 'border-accent text-accent bg-accent/10' : 'border-line text-dim hover:text-ink hover:border-ghost'
              }`}>
              {PRESETS[id].name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ghost mb-2">Mode</p>
        <div className="grid grid-cols-2 gap-2">
          {(['dark', 'light'] as const).map((mode) => (
            <button key={mode} onClick={() => setPrefs({ ...prefs, mode })}
              className={`px-3 py-2 rounded-[var(--c-radius-card)] text-sm font-medium border capitalize transition-colors ${
                prefs.mode === mode ? 'border-accent text-accent bg-accent/10' : 'border-line text-dim hover:text-ink hover:border-ghost'
              }`}>
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

type Section = 'profile' | 'appearance' | 'recently-deleted'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'profile',           label: 'Profile' },
  { id: 'appearance',        label: 'Appearance' },
  { id: 'recently-deleted',  label: 'Recently Deleted' },
]

export function AccountView() {
  const { logout } = useAuth()
  const [active, setActive] = useState<Section>('profile')

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left subnav */}
      <nav className="w-48 shrink-0 border-r border-line bg-panel flex flex-col py-4 gap-0.5 px-2">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-ghost">Account</p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`w-full text-left px-3 py-1.5 rounded-[var(--c-radius-card)] text-sm transition-colors ${
              active === s.id ? 'bg-accent/10 text-accent font-medium' : 'text-dim hover:text-ink hover:bg-surface'
            }`}
          >
            {s.label}
          </button>
        ))}
        <div className="mt-auto pt-4 px-1">
          <button onClick={logout}
            className="w-full py-1.5 px-3 rounded-[var(--c-radius-card)] text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left">
            Sign out
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg">
          {active === 'profile'          && <ProfileSection />}
          {active === 'appearance'       && <AppearanceSection />}
          {active === 'recently-deleted' && <RecentlyDeletedSection />}
        </div>
      </div>
    </div>
  )
}
