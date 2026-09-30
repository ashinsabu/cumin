import { useState, useEffect } from 'react'

type Project = {
  id: string
  name: string
  prefix: string
  item_seq: number
  color: string
  description: string
  created_at: string
}

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', prefix: '', color: '#6b7280', description: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects ?? [])
      }
    } catch {
      // network error — projects stays empty, user sees empty state
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.name || !form.prefix) {
      setError('Name and prefix are required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        setShowCreate(false)
        setForm({ name: '', prefix: '', color: '#6b7280', description: '' })
        fetchProjects()
      } else {
        const data = await res.json()
        setError(data.error || 'Create failed')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) fetchProjects()
    } catch {
      // silently ignore — list will stay as-is
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-ghost">
      <span className="text-sm">Loading...</span>
    </div>
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between border-line">
        <span className="text-xs text-ghost">{projects.length} projects</span>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm font-medium px-3 py-1.5 rounded-[var(--c-radius-card)] transition-colors bg-accent/10 text-accent hover:bg-accent/20"
        >
          + New project
        </button>
      </div>

      {showCreate && (
        <div className="px-4 py-4 border-b border-line bg-panel">
          <form onSubmit={handleCreate} className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-ghost">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Interview Prep"
                className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] border outline-none w-44 bg-surface border-line text-ink"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-ghost">Prefix</label>
              <input
                value={form.prefix}
                onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase().slice(0, 5) }))}
                placeholder="INT"
                maxLength={5}
                className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] border outline-none w-20 font-mono uppercase bg-surface border-line text-ink"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-ghost">Color</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-8 h-8 rounded border-0 cursor-pointer"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-ghost">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] border outline-none w-full bg-surface border-line text-ink"
              />
            </div>
            <button type="submit" disabled={submitting} className="text-sm font-medium px-4 py-1.5 rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] text-dim hover:bg-line">
              Cancel
            </button>
          </form>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 600 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-panel">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 80 }}>Prefix</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line">Project</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 200 }}>Description</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 80 }}>Items</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b transition-colors border-line hover:bg-surface">
                <td className="px-4 py-3">
                  <span className="text-sm font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: p.color + '18', color: p.color }}>{p.prefix}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-sm font-semibold text-ink">{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-dim">{p.description || '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-ink/80">{p.item_seq}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="text-xs px-2 py-1 rounded transition-colors text-red-400 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-ghost">
                  No projects yet. Create one to start organizing work.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
