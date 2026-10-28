import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFlags } from '../context/FlagsContext'
import { AuthRequestError, signUp, resendVerification, requestPasswordReset } from '../lib/auth'
import { AuthCard, AuthField, AuthButton, AuthLinkButton, AuthError } from './AuthCard'

type Mode = 'signin' | 'signup' | 'forgot' | 'sent'

const MIN_PASSWORD_LEN = 10 // mirrors the server (minPasswordLen)

function GoogleButton() {
  return (
    <a
      href={`${import.meta.env.VITE_API_URL ?? ''}/api/auth/google/login`}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--c-radius-card)] bg-white border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors shadow-sm"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </a>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const { isEnabled } = useFlags()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [sentNote, setSentNote] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNeedsVerification(false)
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNeedsVerification(false)
    try {
      await action()
    } catch (err) {
      if (err instanceof AuthRequestError && err.message === 'email_not_verified') {
        setNeedsVerification(true)
        setError('Verify your email first. Check your inbox for the link.')
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'signin') return run(() => login(email, password))
    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD_LEN) return setError(`Password must be at least ${MIN_PASSWORD_LEN} characters`)
      return run(async () => {
        await signUp(email, password, name)
        setSentNote('We sent a verification link. Open it and enter your password to finish creating your account.')
        setMode('sent')
      })
    }
    return run(async () => {
      await requestPasswordReset(email)
      setSentNote('If that address has an account, a reset link is on its way.')
      setMode('sent')
    })
  }

  const resend = () => run(async () => {
    await resendVerification(email)
    setSentNote('If that address needs verifying, a new link is on its way.')
    setMode('sent')
  })

  if (!isEnabled('password_auth')) {
    return (
      <AuthCard title="cumin" subtitle="Your life, sprint-planned.">
        <div className="flex justify-center"><GoogleButton /></div>
      </AuthCard>
    )
  }

  if (mode === 'sent') {
    return (
      <AuthCard title="Check your email" subtitle={sentNote}>
        <div className="text-center"><AuthLinkButton onClick={() => switchMode('signin')}>Back to sign in</AuthLinkButton></div>
      </AuthCard>
    )
  }

  const titles: Record<Exclude<Mode, 'sent'>, string> = { signin: 'Sign in', signup: 'Create account', forgot: 'Reset password' }
  return (
    <AuthCard title="cumin" subtitle={titles[mode]}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === 'signup' && (
          <AuthField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        )}
        <AuthField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {mode !== 'forgot' && (
          <AuthField
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        )}
        {error && <AuthError>{error}</AuthError>}
        {needsVerification && <div><AuthLinkButton onClick={resend}>Resend verification email</AuthLinkButton></div>}
        <AuthButton busy={busy}>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</AuthButton>
      </form>

      <div className="flex justify-between mt-3">
        {mode === 'signin' ? (
          <>
            <AuthLinkButton onClick={() => switchMode('signup')}>Create account</AuthLinkButton>
            <AuthLinkButton onClick={() => switchMode('forgot')}>Forgot password?</AuthLinkButton>
          </>
        ) : (
          <AuthLinkButton onClick={() => switchMode('signin')}>Back to sign in</AuthLinkButton>
        )}
      </div>

      <div className="flex items-center gap-3 my-5 text-ghost text-xs">
        <span className="flex-1 h-px bg-line" />or<span className="flex-1 h-px bg-line" />
      </div>
      <div className="flex justify-center"><GoogleButton /></div>
    </AuthCard>
  )
}
