import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

export function AccountView() {
  const { isDark } = useTheme()
  const { user, logout } = useAuth()

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
        <div className={`rounded-xl p-6 border ${isDark ? 'bg-[#1e1f25] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-4 mb-6">
            {user.avatar_url ? (
              <img src={user.avatar_url} className="w-14 h-14 rounded-full" alt="" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold">{initials}</div>
            )}
            <div>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{user.display_name}</h2>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{user.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>ID Prefix</label>
              <p className={`text-sm font-mono font-semibold mt-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{user.id_prefix}</p>
              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Used for item IDs: {user.id_prefix}-1, {user.id_prefix}-2, ...</p>
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
            isDark
              ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
              : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
          }`}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
