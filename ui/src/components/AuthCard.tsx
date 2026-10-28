import type { ReactNode, InputHTMLAttributes } from 'react'

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm p-8 rounded-[var(--c-radius-card)] border bg-surface border-line">
        <h1 className="text-2xl font-bold mb-1 text-ink text-center">{title}</h1>
        {subtitle && <p className="text-sm mb-6 text-dim text-center">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}

export function AuthField({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-left">
      <span className="block text-xs mb-1 text-dim">{label}</span>
      <input
        {...input}
        className="w-full px-3 py-2 rounded-[var(--c-radius-card)] border border-line bg-canvas text-ink text-sm focus:outline-none focus:border-accent"
      />
    </label>
  )
}

export function AuthButton({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full px-4 py-2 rounded-[var(--c-radius-card)] bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function AuthLinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-accent text-xs hover:underline">
      {children}
    </button>
  )
}

export function AuthError({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-sm text-danger text-left">{children}</p>
}
