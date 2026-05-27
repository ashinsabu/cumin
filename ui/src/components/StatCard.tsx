import { useTheme } from '../context/ThemeContext'

export function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  const { isDark } = useTheme()

  return (
    <div className={`rounded-lg p-4 ${isDark ? 'bg-[#1e1f25] border border-[#2e303a]' : 'bg-white border border-gray-200'}`}>
      <p className={`text-[11px] font-medium uppercase tracking-wider mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</p>
      <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{sub}</p>
    </div>
  )
}
