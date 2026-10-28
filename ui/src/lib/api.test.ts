import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch } from './api'

// Token handling is covered in auth.test.ts; here authFetch just forwards to the stubbed fetch.
vi.mock('./auth', () => ({ authFetch: (path: string, init?: RequestInit) => fetch(path, init) }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(status: number, body?: unknown): void {
  const jsonFn = body !== undefined ? vi.fn(() => Promise.resolve(body)) : vi.fn(() => Promise.reject(new Error('no body')))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jsonFn,
  }))
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

// ─── Success paths ────────────────────────────────────────────────────────────

describe('apiFetch', () => {
  it('returns parsed JSON on 200', async () => {
    mockFetch(200, { id: 'x' })
    const result = await apiFetch<{ id: string }>('/api/test')
    expect(result).toEqual({ id: 'x' })
  })

  it('returns undefined for 204 without calling .json()', async () => {
    // Before the fix, apiFetch called res.json() which throws on No Content.
    // This test guards that regression: 204 → return undefined immediately.
    const jsonSpy = vi.fn(() => Promise.reject(new Error('should not be called')))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: jsonSpy,
    }))

    const result = await apiFetch<undefined>('/api/items/x')

    expect(result).toBeUndefined()
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('sets Content-Type header when body is present', async () => {
    mockFetch(200, {})
    await apiFetch('/api/items', { method: 'POST', body: JSON.stringify({ title: 'x' }) })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('omits Content-Type header when no body', async () => {
    mockFetch(200, {})
    await apiFetch('/api/items')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).headers).toBeUndefined()
  })

  // ─── Error paths ─────────────────────────────────────────────────────────────

  it('throws with server error message on 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: 'title is required' }),
    }))

    await expect(apiFetch('/api/items')).rejects.toThrow('title is required')
  })

  it('throws with status+path when server returns no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    }))

    await expect(apiFetch('/api/items')).rejects.toThrow('500 /api/items')
  })
})
