import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authFetch, refreshSession, loginWithPassword, logout, onSessionLost, hasAccessToken, resetAuthForTests, AuthRequestError } from './auth'

const user = { id: 'u1', email: 'a@b.co', display_name: 'A', avatar_url: '', id_prefix: 'ABC' }

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const refreshOk = (token = 'access-1') => json(200, { access_token: token, expires_in: 900, user })

beforeEach(() => {
  vi.unstubAllGlobals()
  resetAuthForTests()
})

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init: RequestInit = {}) => Promise.resolve(handler(url, init)))
  vi.stubGlobal('fetch', fn)
  return fn
}
const authHeader = (init: RequestInit) => new Headers(init.headers).get('Authorization')

describe('refreshSession', () => {
  it('sends the cookie with the CSRF header and keeps the access token in memory', async () => {
    const f = stubFetch(() => refreshOk())
    expect(await refreshSession()).toEqual(user)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/auth/refresh')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('cumin')
    expect(hasAccessToken()).toBe(true)
  })

  it('returns null on 401 (logged out) and drops any token', async () => {
    stubFetch(() => json(401, { error: 'session expired' }))
    expect(await refreshSession()).toBeNull()
    expect(hasAccessToken()).toBe(false)
  })

  // A database blip answers 5xx: the cookie is still valid, so this must not look like a logout.
  it('throws on transient failures instead of reporting logged-out', async () => {
    stubFetch(() => json(503, { error: 'x' }))
    await expect(refreshSession()).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))))
    await expect(refreshSession()).rejects.toThrow()
  })

  // Rotation means two concurrent refreshes with the same cookie are wasteful at best.
  it('is single-flight: concurrent callers share one request', async () => {
    const f = stubFetch(() => refreshOk())
    await Promise.all([refreshSession(), refreshSession(), refreshSession()])
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('authFetch', () => {
  it('refreshes first when there is no access token (page reload), then sends Bearer', async () => {
    const f = stubFetch((url) => (url === '/api/auth/refresh' ? refreshOk('tok-A') : json(200, { ok: true })))
    const res = await authFetch('/api/items')
    expect(res.status).toBe(200)
    expect(f.mock.calls.map((c) => c[0])).toEqual(['/api/auth/refresh', '/api/items'])
    expect(authHeader(f.mock.calls[1][1])).toBe('Bearer tok-A')
  })

  it('on 401 refreshes once and retries with the new token', async () => {
    let token = 'old'
    const f = stubFetch((url, init) => {
      if (url === '/api/auth/refresh') { token = 'new'; return refreshOk('new') }
      return authHeader(init) === `Bearer ${token}` ? json(200, { ok: true }) : json(401, { error: 'invalid token' })
    })
    await refreshSession() // issues 'new'... then make the server rotate to expect another token
    token = 'rotated'
    const res = await authFetch('/api/items')
    expect(res.status).toBe(200)
    const urls = f.mock.calls.map((c) => c[0])
    expect(urls).toEqual(['/api/auth/refresh', '/api/items', '/api/auth/refresh', '/api/items'])
  })

  it('many parallel 401s trigger a single refresh', async () => {
    let valid = false
    const f = stubFetch((url) => {
      if (url === '/api/auth/refresh') { valid = true; return refreshOk('fresh') }
      return valid ? json(200, {}) : json(401, {})
    })
    await refreshSession()
    valid = false
    f.mockClear()
    await Promise.all([authFetch('/api/a'), authFetch('/api/b'), authFetch('/api/c')])
    expect(f.mock.calls.filter((c) => c[0] === '/api/auth/refresh')).toHaveLength(1)
  })

  it('does not loop: a second 401 after refreshing is returned to the caller', async () => {
    const f = stubFetch((url) => (url === '/api/auth/refresh' ? refreshOk() : json(401, {})))
    const res = await authFetch('/api/items')
    expect(res.status).toBe(401)
    expect(f.mock.calls.filter((c) => c[0] === '/api/items')).toHaveLength(2)
  })

  it('reports a lost session when the refresh is rejected', async () => {
    const lost = vi.fn()
    onSessionLost(lost)
    stubFetch(() => json(401, {}))
    const res = await authFetch('/api/items')
    expect(res.status).toBe(401)
    expect(lost).toHaveBeenCalledTimes(1)
  })

  it('does not report a lost session on a transient refresh failure', async () => {
    const lost = vi.fn()
    onSessionLost(lost)
    stubFetch(() => json(503, {}))
    await expect(authFetch('/api/items')).rejects.toThrow()
    expect(lost).not.toHaveBeenCalled()
  })

  it('keeps caller headers and never sends cookies-only auth', async () => {
    const f = stubFetch((url) => (url === '/api/auth/refresh' ? refreshOk() : json(200, {})))
    await authFetch('/api/items', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
    const init = f.mock.calls[1][1]
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(authHeader(init)).toBe('Bearer access-1')
  })
})

describe('loginWithPassword / logout', () => {
  it('stores the access token and returns the user', async () => {
    const f = stubFetch(() => refreshOk('login-tok'))
    expect(await loginWithPassword('a@b.co', 'pw')).toEqual(user)
    expect(f.mock.calls[0][0]).toBe('/api/auth/password/login')
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toEqual({ email: 'a@b.co', password: 'pw' })
    expect(hasAccessToken()).toBe(true)
  })

  it('surfaces the server error message and status', async () => {
    stubFetch(() => json(403, { error: 'email_not_verified' }))
    const err = await loginWithPassword('a@b.co', 'pw').catch((e) => e)
    expect(err).toBeInstanceOf(AuthRequestError)
    expect(err.status).toBe(403)
    expect(err.message).toBe('email_not_verified')
  })

  it('logout clears the token even if the request fails', async () => {
    stubFetch(() => refreshOk())
    await refreshSession()
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
    await logout()
    expect(hasAccessToken()).toBe(false)
  })
})
