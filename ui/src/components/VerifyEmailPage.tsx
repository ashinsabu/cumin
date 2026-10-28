import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthRequestError, verifyEmail } from '../lib/auth'
import { AuthCard, AuthField, AuthButton, AuthError } from './AuthCard'

// The emailed link alone cannot verify an account: the password chosen at signup is required too,
// so someone who registered another person's address cannot claim it by waiting for them to click.
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await verifyEmail(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof AuthRequestError && err.status === 401 ? 'Incorrect password. Try again.' : err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthCard title="Email verified" subtitle="Your account is ready.">
        <Link to="/" className="block text-center text-accent text-sm hover:underline">Sign in</Link>
      </AuthCard>
    )
  }
  if (!token) {
    return (
      <AuthCard title="Invalid link" subtitle="This verification link is missing its token.">
        <Link to="/" className="block text-center text-accent text-sm hover:underline">Back to sign in</Link>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Verify your email" subtitle="Enter the password you chose at signup to confirm it's you.">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <AuthField label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <AuthError>{error}</AuthError>}
        <AuthButton busy={busy}>Verify email</AuthButton>
      </form>
    </AuthCard>
  )
}
