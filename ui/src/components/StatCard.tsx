export function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[var(--c-radius-card)] p-4 bg-surface border border-line">
      <p className="text-xs font-medium uppercase tracking-wider mb-1 text-ghost">{label}</p>
      <p className="text-xl font-bold text-ink">{value}</p>
      <p className="text-xs mt-0.5 text-ghost">{sub}</p>
    </div>
  )
}
