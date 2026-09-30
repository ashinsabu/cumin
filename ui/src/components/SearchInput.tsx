type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  width?: string
  className?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search…', width = 'w-40', className = '' }: Props) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-[var(--c-radius-card)] border bg-surface border-line focus-within:border-ghost transition-colors ${className}`}>
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-ghost">
        <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M9 9L11.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`text-sm outline-none bg-transparent ${width} text-ink placeholder:text-ghost`}
      />
    </div>
  )
}
