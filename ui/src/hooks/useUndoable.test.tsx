import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const push = vi.hoisted(() => vi.fn())
const authFetch = vi.hoisted(() => vi.fn())
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ push }) }))
vi.mock('../lib/auth', () => ({ authFetch }))

import { useUndoable, softDelete } from './useUndoable'

beforeEach(() => { push.mockReset(); authFetch.mockReset() })

const setup = (run: () => Promise<{ ok: boolean }>, undo: () => Promise<{ ok: boolean }> = async () => ({ ok: true })) => {
  const apply = vi.fn(), revert = vi.fn()
  const { result } = renderHook(() => useUndoable<string>({ label: (t) => `${t} gone`, apply, run, undo, revert }))
  return { apply, revert, perform: result.current }
}

describe('useUndoable', () => {
  it('applies optimistically, then offers undo that restores server-side and reverts locally', async () => {
    const undo = vi.fn(async () => ({ ok: true }))
    const { apply, revert, perform } = setup(async () => ({ ok: true }), undo)
    await act(() => perform('x'))
    expect(apply).toHaveBeenCalledWith('x')
    expect(revert).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ message: 'x gone' }))

    await act(() => push.mock.calls[0][0].undo())
    expect(undo).toHaveBeenCalledWith('x')
    expect(revert).toHaveBeenCalledWith('x')
  })

  it('reverts and shows no toast when the action fails', async () => {
    const { revert, perform } = setup(async () => ({ ok: false }))
    await act(() => perform('x'))
    expect(revert).toHaveBeenCalledWith('x')
    expect(push).not.toHaveBeenCalled()
  })

  it('keeps local state when undo fails, because the server still has the action applied', async () => {
    const { revert, perform } = setup(async () => ({ ok: true }), async () => ({ ok: false }))
    await act(() => perform('x'))
    await act(() => push.mock.calls[0][0].undo())
    expect(revert).not.toHaveBeenCalled()
    expect(push).toHaveBeenLastCalledWith({ message: "Couldn't undo" })
  })
})

describe('softDelete', () => {
  it('DELETEs each path and restores via <path>/restore; a batch fails if any call fails', async () => {
    authFetch.mockResolvedValue({ ok: true })
    const spec = softDelete<string[]>((ids) => ids.map((id) => `/api/q/${id}`))
    expect(await spec.run(['a', 'b'])).toEqual({ ok: true })
    expect(authFetch).toHaveBeenCalledWith('/api/q/a', { method: 'DELETE' })
    await spec.undo(['a'])
    expect(authFetch).toHaveBeenCalledWith('/api/q/a/restore', { method: 'POST' })

    authFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false })
    expect(await spec.run(['a', 'b'])).toEqual({ ok: false })
  })
})
