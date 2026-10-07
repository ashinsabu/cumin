import { useState, useMemo } from 'react'
import { useBoard } from '../context/BoardContext'
import { useItems } from '../hooks/useItems'
import { useProjects, useCreateProject } from '../hooks/useProjects'
import { usePersistentState } from '../hooks/usePersistentState'
import type { Project } from '../types'

const PRESET_COLORS = ['#6b7280', '#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6']

type SortKey = 'prefix' | 'name' | 'items' | 'description'
type SortDir = 'asc' | 'desc'
type ViewMode = 'list' | 'grid'

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-ghost/40">↕</span>
  return <span className="ml-1 text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

export function ProjectsView() {
  const { deleteProject } = useBoard()
  const { data: projects = [] } = useProjects()
  const { data: items = [] } = useItems()
  const createProjectMutation = useCreateProject()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', prefix: '', color: PRESET_COLORS[0], description: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [sortKey, setSortKey] = usePersistentState<SortKey>('cumin:projects:sortKey', 'name')
  const [sortDir, setSortDir] = usePersistentState<SortDir>('cumin:projects:sortDir', 'asc')
  const [viewMode, setViewMode] = usePersistentState<ViewMode>('cumin:projects:viewMode', 'list')

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function thClass(key: SortKey) {
    return `text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line cursor-pointer select-none hover:text-ink transition-colors ${sortKey === key ? 'text-ink' : ''}`
  }

  const projectsWithCount = useMemo(() =>
    projects.map((p) => ({ project: p, itemCount: items.filter(i => i.project_id === p.id).length })),
    [projects, items]
  )

  const sorted = useMemo(() => [...projectsWithCount].sort((a, b) => {
    let av: string | number, bv: string | number
    switch (sortKey) {
      case 'prefix':      av = a.project.prefix; bv = b.project.prefix; break
      case 'name':        av = a.project.name.toLowerCase(); bv = b.project.name.toLowerCase(); break
      case 'items':       av = a.itemCount; bv = b.itemCount; break
      case 'description': av = a.project.description ?? ''; bv = b.project.description ?? ''; break
      default:            av = 0; bv = 0
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  }), [projectsWithCount, sortKey, sortDir])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name || !form.prefix) { setError('Name and prefix are required'); return }
    setSubmitting(true)
    try {
      await createProjectMutation.mutateAsync({ name: form.name, prefix: form.prefix, color: form.color, description: form.description })
      setShowCreate(false)
      setForm({ name: '', prefix: '', color: PRESET_COLORS[0], description: '' })
    } catch (err: any) {
      setError(err.message || 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  function handleConfirmDelete() {
    if (!confirmDelete) return
    deleteProject(confirmDelete.id)
    setConfirmDelete(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between border-line">
        <span className="text-xs text-ghost">{projects.length} projects</span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-[var(--c-radius-card)] border border-line overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1.5 text-xs transition-colors ${viewMode === 'list' ? 'bg-accent/10 text-accent' : 'text-dim hover:bg-surface'}`}
              title="List view"
            >☰</button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1.5 text-xs border-l border-line transition-colors ${viewMode === 'grid' ? 'bg-accent/10 text-accent' : 'text-dim hover:bg-surface'}`}
              title="Grid view"
            >⊞</button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-[var(--c-radius-card)] transition-colors bg-accent/10 text-accent hover:bg-accent/20"
          >
            + New project
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="px-4 py-4 border-b border-line bg-panel">
          <form onSubmit={handleCreate} className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-ghost">Name</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Interview Prep"
                className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] border outline-none w-44 bg-surface border-line text-ink focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-ghost">Prefix</label>
              <input
                value={form.prefix}
                onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase().slice(0, 5) }))}
                placeholder="INT"
                maxLength={5}
                className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] border outline-none w-20 font-mono uppercase bg-surface border-line text-ink focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-ghost">Color</label>
              <div className="flex gap-1.5 flex-wrap pt-0.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-5 h-5 rounded-full transition-transform ${form.color === c ? 'scale-125' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c, outline: form.color === c ? `2px solid ${c}` : undefined, outlineOffset: '2px' }}
                  />
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-ghost">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
                className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] border outline-none w-full bg-surface border-line text-ink focus:border-accent"
              />
            </div>
            <button type="submit" disabled={submitting}
              className="text-sm font-medium px-4 py-1.5 rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90 disabled:opacity-50">
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)}
              className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] text-dim hover:bg-line">
              Cancel
            </button>
          </form>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-[var(--c-radius-card)] border bg-raised border-line shadow-xl p-5 flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">Delete "{confirmDelete.name}"?</p>
              <p className="text-xs text-dim mt-1">All items in this project will be moved to trash.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm rounded-[var(--c-radius-card)] text-dim hover:text-ink hover:bg-line">
                Cancel
              </button>
              <button onClick={handleConfirmDelete}
                className="px-4 py-1.5 text-sm font-semibold rounded-[var(--c-radius-card)] bg-red-500 text-white hover:opacity-90">
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {viewMode === 'list' ? (
          <table className="w-full border-collapse" style={{ minWidth: 600 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-panel">
                <th className={thClass('prefix')} style={{ width: 80 }} onClick={() => handleSort('prefix')}>
                  Prefix<SortIcon col="prefix" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thClass('name')} onClick={() => handleSort('name')}>
                  Project<SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thClass('description')} style={{ width: 200 }} onClick={() => handleSort('description')}>
                  Description<SortIcon col="description" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thClass('items')} style={{ width: 80 }} onClick={() => handleSort('items')}>
                  Items<SortIcon col="items" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ project: p, itemCount }) => (
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
                    <span className="text-sm font-medium text-ink/80">{itemCount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setConfirmDelete({ id: p.id, name: p.name })}
                      className="text-xs px-2 py-1 rounded transition-colors text-red-400 hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-ghost">
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map(({ project: p, itemCount }) => (
              <ProjectCard
                key={p.id}
                project={p}
                itemCount={itemCount}
                onDelete={() => setConfirmDelete({ id: p.id, name: p.name })}
              />
            ))}
            {sorted.length === 0 && (
              <p className="col-span-full text-center text-sm text-ghost py-8">
                No projects yet. Create one to start organizing work.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectCard({ project: p, itemCount, onDelete }: { project: Project; itemCount: number; onDelete: () => void }) {
  return (
    <div className="rounded-[var(--c-radius-card)] border border-line bg-surface hover:bg-raised transition-colors p-4 flex flex-col gap-3 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-sm font-semibold text-ink truncate">{p.name}</span>
        </div>
        <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: p.color + '18', color: p.color }}>{p.prefix}</span>
      </div>
      {p.description && <p className="text-xs text-dim line-clamp-2">{p.description}</p>}
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs text-ghost">{itemCount} items</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-xs text-red-400 hover:bg-red-500/10 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
