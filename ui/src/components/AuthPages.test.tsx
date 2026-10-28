import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const login = vi.fn()
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login }) }))
vi.mock('../context/FlagsContext', () => ({ useFlags: () => ({ isEnabled: (f: string) => mockFlags[f] ?? false }) }))
let mockFlags: Record<string, boolean> = {}

vi.mock('../lib/auth', async () => {
  class AuthRequestError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return {
    AuthRequestError,
    signUp: vi.fn(), resendVerification: vi.fn(), requestPasswordReset: vi.fn(),
    verifyEmail: vi.fn(), resetPassword: vi.fn(),
  }
})
import * as auth from '../lib/auth'
import { LoginPage } from './LoginPage'
import { VerifyEmailPage } from './VerifyEmailPage'
import { ResetPasswordPage } from './ResetPasswordPage'

const Err = auth.AuthRequestError

beforeEach(() => {
  vi.clearAllMocks()
  mockFlags = { password_auth: true }
})

describe('LoginPage', () => {
  it('shows only Google sign-in when password auth is off', () => {
    mockFlags = {}
    render(<LoginPage />)
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('signs in with email and password', async () => {
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(login).toHaveBeenCalledWith('a@b.co', 'correct-horse')
  })

  it('offers to resend the link when the email is not verified', async () => {
    login.mockRejectedValueOnce(new Err(403, 'email_not_verified'))
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await userEvent.click(await screen.findByText('Resend verification email'))
    expect(auth.resendVerification).toHaveBeenCalledWith('a@b.co')
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
  })

  it('rejects a short signup password locally without calling the server', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByText('Create account'))
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 10')
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('signs up then tells the user to check email', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByText('Create account'))
    await userEvent.type(screen.getByLabelText('Name'), 'Ann')
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(auth.signUp).toHaveBeenCalledWith('a@b.co', 'correct-horse', 'Ann')
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
  })

  it('requests a password reset', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByText('Forgot password?'))
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('a@b.co')
  })

  it('shows the server error on a bad login', async () => {
    login.mockRejectedValueOnce(new Err(401, 'invalid email or password'))
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid email or password')
  })
})

const at = (ui: React.ReactElement, url: string) => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>)

// Regression: the verify link alone must not verify; the signup password is required (pre-hijack fix).
describe('VerifyEmailPage', () => {
  it('sends the token together with the entered password', async () => {
    at(<VerifyEmailPage />, '/verify-email?token=tok123')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Verify email' }))
    expect(auth.verifyEmail).toHaveBeenCalledWith('tok123', 'correct-horse')
    expect(await screen.findByText('Email verified')).toBeInTheDocument()
  })

  it('stays on the form with a clear message on a wrong password', async () => {
    vi.mocked(auth.verifyEmail).mockRejectedValueOnce(new Err(401, 'incorrect password'))
    at(<VerifyEmailPage />, '/verify-email?token=tok123')
    await userEvent.type(screen.getByLabelText('Password'), 'nope-nope-nope')
    await userEvent.click(screen.getByRole('button', { name: 'Verify email' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password'))
    expect(screen.queryByText('Email verified')).not.toBeInTheDocument()
  })

  it('shows an invalid-link state without a token', () => {
    at(<VerifyEmailPage />, '/verify-email')
    expect(screen.getByText('Invalid link')).toBeInTheDocument()
  })
})

describe('ResetPasswordPage', () => {
  it('rejects a short password without consuming the link', async () => {
    at(<ResetPasswordPage />, '/reset-password?token=t')
    await userEvent.type(screen.getByLabelText('New password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 10')
    expect(auth.resetPassword).not.toHaveBeenCalled()
  })

  it('resets with the token', async () => {
    at(<ResetPasswordPage />, '/reset-password?token=t')
    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-password')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(auth.resetPassword).toHaveBeenCalledWith('t', 'brand-new-password')
    expect(await screen.findByText('Password updated')).toBeInTheDocument()
  })

  it('shows an invalid-link state without a token', () => {
    at(<ResetPasswordPage />, '/reset-password')
    expect(screen.getByText('Invalid link')).toBeInTheDocument()
  })
})
