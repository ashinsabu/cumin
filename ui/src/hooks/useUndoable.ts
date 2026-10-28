import { useCallback, useEffect, useRef } from 'react'
import { useToast } from '../context/ToastContext'
import { authFetch } from '../lib/auth'

// The one way to make an action undoable. The server call goes out immediately and undo calls the
// reverse endpoint, so a reload mid-toast loses nothing. Every undoable action is declared as a spec:
//
//   const remove = useUndoable<Thing>({
//     label: (t) => `"${t.name}" deleted`,
//     ...softDelete((t) => `/api/things/${t.id}`),   // DELETE /x/{id} + POST /x/{id}/restore
//     apply: (t) => /* optimistic local change */,
//     revert: (t) => /* put local state back (also runs after a successful undo) */,
//   })
//   remove(thing)
//
// New destructive or state-changing actions go through this hook with a reverse endpoint — no hand-rolled toasts.

type Outcome = { ok: boolean }

export type UndoableSpec<T> = {
  label: (target: T) => string
  /** Optimistic local change, applied before the request. */
  apply?: (target: T) => void
  run: (target: T) => Promise<Outcome>
  undo: (target: T) => Promise<Outcome>
  /** Restores local state. Called when `run` fails and after a successful undo. */
  revert: (target: T) => void
}

/** `run` = DELETE each path, `undo` = POST <path>/restore for each. One path or a batch; batches succeed only if every call does. */
export function softDelete<T>(paths: (target: T) => string | string[]) {
  const all = (target: T, init: (path: string) => [string, RequestInit]) =>
    Promise.all([paths(target)].flat().map((p) => authFetch(...init(p)))).then((rs) => ({ ok: rs.every((r) => r.ok) }))
  return {
    run: (target: T) => all(target, (p) => [p, { method: 'DELETE' }]),
    undo: (target: T) => all(target, (p) => [`${p}/restore`, { method: 'POST' }]),
  }
}

export function useUndoable<T>(spec: UndoableSpec<T>) {
  const { push } = useToast()
  const specRef = useRef(spec)
  useEffect(() => { specRef.current = spec })

  return useCallback(async (target: T): Promise<void> => {
    const s = specRef.current
    s.apply?.(target)
    try {
      if (!(await s.run(target)).ok) throw new Error('request failed')
    } catch {
      s.revert(target)
      return
    }
    push({
      message: s.label(target),
      undo: async () => {
        // A failed undo leaves local state as is: the server still has the action applied, so the UI stays truthful.
        const restored = await s.undo(target).catch(() => ({ ok: false }))
        if (restored.ok) s.revert(target)
        else push({ message: "Couldn't undo" })
      },
    })
  }, [push])
}
