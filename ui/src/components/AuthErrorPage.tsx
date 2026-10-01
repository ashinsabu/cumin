import { useSearchParams } from 'react-router-dom'

const REASON_LABELS: Record<string, string> = {
  invalid_state: 'Login session expired or was tampered with.',
  missing_code: 'Google did not return an authorization code.',
  token_exchange_failed: 'Could not complete sign-in with Google.',
  server_error: 'An internal error occurred during sign-in.',
}

export function AuthErrorPage() {
  const [params] = useSearchParams()
  const reason = params.get('reason') ?? 'server_error'
  const message = REASON_LABELS[reason] ?? REASON_LABELS.server_error

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-canvas">
      <div className="w-full max-w-sm rounded-[var(--c-radius-card)] border border-line bg-surface p-8 flex flex-col items-center gap-4 text-center shadow-lg">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-red-500">
          <circle cx="20" cy="20" r="19" stroke="currentColor" strokeWidth="2"/>
          <path d="M20 12v10M20 27v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <div>
          <p className="text-base font-semibold text-ink mb-1">Sign-in failed</p>
          <p className="text-sm text-dim">{message}</p>
        </div>
        <a
          href={`${import.meta.env.VITE_API_URL ?? ''}/api/auth/google/login`}
          className="w-full text-center px-4 py-2 rounded-[var(--c-radius-card)] bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Try again
        </a>
      </div>
    </div>
  )
}
