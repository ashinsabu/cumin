import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { PRESETS } from '../themes/index'
import type { Preset } from '../themes/types'

const PRESET_IDS: Preset['id'][] = ['cyber', 'glass', 'minimal']

export function AccountView() {
  const { user, logout } = useAuth()
  const { prefs, setPrefs } = useTheme()

  if (!user) return null

  const initials = user.display_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-md mx-auto space-y-6">
        <div className="rounded-[var(--c-radius-card)] p-6 border bg-surface border-line">
          <div className="flex items-center gap-4 mb-6">
            {user.avatar_url ? (
              <img src={user.avatar_url} className="w-14 h-14 rounded-full" alt="" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center text-white text-lg font-bold">{initials}</div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-ink">{user.display_name}</h2>
              <p className="text-sm text-dim">{user.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-ghost">ID Prefix</label>
              <p className="text-sm font-mono font-semibold mt-1 text-ink/80">{user.id_prefix}</p>
              <p className="text-xs mt-0.5 text-ghost">Used for item IDs: {user.id_prefix}-1, {user.id_prefix}-2, ...</p>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--c-radius-card)] p-6 border bg-surface border-line space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ghost">Appearance</h3>
          <div>
            <p className="text-xs text-dim mb-2">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => setPrefs({ ...prefs, preset: id })}
                  className={`px-3 py-2 rounded-[var(--c-radius-card)] text-sm font-medium border transition-colors ${
                    prefs.preset === id
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-line text-dim hover:text-ink hover:border-ghost'
                  }`}
                >
                  {PRESETS[id].name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-dim mb-2">Mode</p>
            <div className="grid grid-cols-2 gap-2">
              {(['dark', 'light'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPrefs({ ...prefs, mode })}
                  className={`px-3 py-2 rounded-[var(--c-radius-card)] text-sm font-medium border capitalize transition-colors ${
                    prefs.mode === mode
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-line text-dim hover:text-ink hover:border-ghost'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full py-2.5 px-4 rounded-[var(--c-radius-card)] text-sm font-medium transition-colors bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
