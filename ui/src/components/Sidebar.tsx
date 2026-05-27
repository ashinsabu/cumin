import { useTheme } from '../context/ThemeContext'
import type { NavEntry } from '../types'

type SidebarProps = {
  views: NavEntry[]
  activeId: string
  onNavigate: (id: string) => void
}

export function Sidebar({ views, activeId, onNavigate }: SidebarProps) {
  const { isDark, toggle } = useTheme()

  return (
    <aside className={`hidden md:flex flex-col w-[200px] shrink-0 border-r ${isDark ? 'bg-[#16171d] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
      <div className="px-4 py-4">
        <h1 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>cumin</h1>
      </div>
      <nav className="flex-1 px-2">
        {views.map((nav) => (
          <button key={nav.id} onClick={() => onNavigate(nav.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium mb-0.5 transition-colors ${
              activeId === nav.id
                ? isDark ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                : isDark ? 'text-gray-400 hover:bg-[#1e1f25] hover:text-gray-200' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}>
            <span className="text-sm">{nav.icon}</span>{nav.label}
          </button>
        ))}
      </nav>
      <div className={`px-3 py-3 border-t ${isDark ? 'border-[#2e303a]' : 'border-gray-200'}`}>
        <button onClick={toggle}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors ${isDark ? 'text-gray-400 hover:bg-[#1e1f25]' : 'text-gray-600 hover:bg-gray-50'}`}>
          <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>{isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <div className={`flex items-center gap-2 px-3 py-2 mt-1 rounded-lg cursor-pointer transition-colors ${isDark ? 'hover:bg-[#1e1f25]' : 'hover:bg-gray-50'}`}>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">AS</div>
          <span className={`text-[12px] font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Ashin Sabu</span>
        </div>
      </div>
    </aside>
  )
}

export function MobileNav({ views, activeId, onNavigate, onClose }: SidebarProps & { onClose: () => void }) {
  const { isDark } = useTheme()

  return (
    <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30" />
      <aside className={`fixed left-0 top-0 bottom-0 w-[220px] border-r ${isDark ? 'bg-[#16171d] border-[#2e303a]' : 'bg-white border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-4"><h1 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>cumin</h1></div>
        <nav className="px-2">
          {views.map((nav) => (
            <button key={nav.id} onClick={() => { onNavigate(nav.id); onClose() }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-colors ${
                activeId === nav.id ? isDark ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600' : isDark ? 'text-gray-400 hover:bg-[#1e1f25]' : 'text-gray-600 hover:bg-gray-50'
              }`}><span>{nav.icon}</span>{nav.label}</button>
          ))}
        </nav>
      </aside>
    </div>
  )
}
