import { authFetch } from './auth'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `${res.status} ${path}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
