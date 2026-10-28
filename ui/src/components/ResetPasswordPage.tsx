import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useUrlToken } from '../lib/useUrlToken'
import { resetPassword } from '../lib/auth'
import { AuthCard, AuthField, AuthButton, AuthError } from './AuthCard'

const MIN_PASSWORD_LEN = 10 // mirrors the server (minPasswordLen)

export function ResetPasswordPage() {
  const token = useUrlToken()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthCard title="Password updated" subtitle="You've been signed out everywhere. Sign in with your new password.">
        <Link to="/" className="block text-center text-accent text-sm hover:underline">Sign in</Link>
      </AuthCard>
    )
  }
  if (!token) {
    return (
      <AuthCard title="Invalid link" subtitle="This reset link is missing its token.">
        <Link to="/" className="block text-center text-accent text-sm hover:underline">Back to sign in</Link>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <AuthField label="New password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        {error && <AuthError>{error}</AuthError>}
        <AuthButton busy={busy}>Update password</AuthButton>
      </form>
    </AuthCard>
  )
}
