// Session client. The access token (15m JWT) lives only in memory; the long-lived login is an
// httpOnly refresh cookie that this module exchanges for new access tokens via /api/auth/refresh.
const API = import.meta.env.VITE_API_URL ?? ''

// The server rejects cookie-borne POSTs without this header (CSRF defence for /api/auth/*).
const CSRF_HEADERS = { 'X-Requested-With': 'cumin' }

export interface SessionUser {
  id: string
  email: string
  display_name: string
  avatar_url: string
  id_prefix: string
}

interface AuthResponse {
  access_token: string
  expires_in: number
  user: SessionUser
}

export class AuthRequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let accessToken: string | null = null
let inflightRefresh: Promise<SessionUser | null> | null = null
let sessionLostHandler: (() => void) | null = null
// Bumped by logout() so a refresh that was already in flight cannot restore the token afterwards.
let generation = 0

export const hasAccessToken = () => accessToken !== null

/** Registers the callback fired when the server rejects the refresh token (user must sign in again). */
export function onSessionLost(handler: (() => void) | null) {
  sessionLostHandler = handler
}

export function resetAuthForTests() {
  accessToken = null
  inflightRefresh = null
  sessionLostHandler = null
}

/**
 * Exchanges the refresh cookie for a fresh access token. Resolves null when there is no valid login
 * (401) and throws on transient failures, so a server blip is never mistaken for a logout.
 * Concurrent callers share one request: refresh tokens rotate, so parallel calls would race.
 */
export function refreshSession(): Promise<SessionUser | null> {
  inflightRefresh ??= (async () => {
    const startedAt = generation
    try {
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: CSRF_HEADERS,
      })
      if (res.status === 401) {
        accessToken = null
        return null
      }
      if (!res.ok) throw new AuthRequestError(res.status, `refresh failed (${res.status})`)
      const body = (await res.json()) as AuthResponse
      // A logout that started while this refresh was in flight wins; don't resurrect the session.
      if (generation !== startedAt) return null
      accessToken = body.access_token
      return body.user
    } finally {
      inflightRefresh = null
    }
  })()
  return inflightRefresh
}

/** fetch with the Bearer token attached; refreshes when absent and retries once on a 401. */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (accessToken === null && (await refreshSession()) === null) {
    sessionLostHandler?.()
    return new Response(JSON.stringify({ error: 'session expired' }), { status: 401 })
  }

  const send = (token: string | null) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(`${API}${path}`, { ...init, headers })
  }

  const used = accessToken
  const res = await send(used)
  if (res.status !== 401) return res

  // Another request may already have refreshed while this one was in flight.
  if (accessToken === used) {
    if ((await refreshSession()) === null) {
      sessionLostHandler?.()
      return res
    }
  }
  return send(accessToken)
}

async function postAuth<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...CSRF_HEADERS, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AuthRequestError(res.status, (data as { error?: string }).error ?? `${res.status} ${path}`)
  return data as T
}

export async function loginWithPassword(email: string, password: string): Promise<SessionUser> {
  const body = await postAuth<AuthResponse>('/api/auth/password/login', { email, password })
  accessToken = body.access_token
  return body.user
}

/** Ends the login server-side (best effort) and always forgets the local token. */
export async function logout(): Promise<void> {
  generation++
  accessToken = null
  try {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: CSRF_HEADERS })
  } catch {
    // Offline: the cookie stays until it expires, but this tab is signed out.
  }
}

// Account lifecycle. Signup, resend and forgot answer identically whether or not the address is
// registered (the server is enumeration-safe), so callers show one neutral confirmation.
export const signUp = (email: string, password: string, name: string) =>
  postAuth<void>('/api/auth/password/signup', { email, password, name })

export const resendVerification = (email: string) =>
  postAuth<void>('/api/auth/email/resend', { email })

export const verifyEmail = (token: string, password: string) =>
  postAuth<void>('/api/auth/email/verify', { token, password })

export const requestPasswordReset = (email: string) => postAuth<void>('/api/auth/password/forgot', { email })

export const resetPassword = (token: string, password: string) =>
  postAuth<void>('/api/auth/password/reset', { token, password })
