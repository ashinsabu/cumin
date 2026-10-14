import { useState, useMemo, useEffect, useRef } from 'react'
import { useItems } from '../hooks/useItems'
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject } from '../hooks/useProjects'
import { useSelectedProject } from '../hooks/useSelectedProject'
import { usePersistentState } from '../hooks/usePersistentState'
import { PRESET_COLORS, SortIcon, ColorPicker, ViewModeToggle, PageToolbar, ModalBase, ConfirmModal } from '../components/ui'
import type { Project } from '../types'

function derivePrefixFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return words.map((w) => w[0]).join('').slice(0, 5).toUpperCase()
}

type FormState = { name: string; prefix: string; color: string; description: string }
const EMPTY_FORM: FormState = { name: '', prefix: '', color: PRESET_COLORS[1], description: '' }

function ProjectFormModal({
  mode,
  initial,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  mode: 'create' | 'edit'
  initial: FormState
  onClose: () => void
  onSubmit: (form: FormState) => void
  submitting: boolean
  error: string
}) {
  const [form, setForm] = useState<FormState>(initial)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  // Auto-derive prefix as user types name (only when prefix hasn't been manually edited)
  const prefixEditedRef = useRef(mode === 'edit')
  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      prefix: prefixEditedRef.current ? f.prefix : derivePrefixFromName(name),
    }))
  }
  function handlePrefixChange(raw: string) {
    prefixEditedRef.current = true
    setForm((f) => ({ ...f, prefix: raw.toUpperCase().slice(0, 5) }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <ModalBase onClose={onClose}>
        <div className="px-5 pt-5 pb-4 border-b border-line">
          <p className="text-sm font-semibold text-ink">
            {mode === 'create' ? 'New project' : 'Edit project'}
          </p>
          <p className="text-xs text-dim mt-0.5">
            {mode === 'create' ? 'Projects let you scope work to a team or goal.' : 'Update project name, prefix, color, or description.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ghost mb-1.5">Name</label>
              <input
                ref={nameRef}
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Interview Prep"
                className="w-full text-sm px-3 py-2 rounded-[var(--c-radius-card)] border outline-none bg-canvas border-line text-ink focus:border-accent/60 placeholder:text-ghost"
              />
            </div>
            <div style={{ width: 100 }}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ghost mb-1.5">Prefix</label>
              <input
                value={form.prefix}
                onChange={(e) => handlePrefixChange(e.target.value)}
                placeholder="INT"
                maxLength={5}
                className="w-full text-sm px-3 py-2 rounded-[var(--c-radius-card)] border outline-none font-mono uppercase bg-canvas border-line text-ink focus:border-accent/60 placeholder:text-ghost"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ghost mb-1.5">Color</label>
            <ColorPicker value={form.color} onChange={(c) => setForm((f) => ({ ...f, color: c }))} />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ghost mb-1.5">Description <span className="normal-case font-normal text-ghost/60">(optional)</span></label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What is this project for?"
              className="w-full text-sm px-3 py-2 rounded-[var(--c-radius-card)] border outline-none bg-canvas border-line text-ink focus:border-accent/60 placeholder:text-ghost"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-[var(--c-radius-card)] text-dim hover:text-ink hover:bg-line transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !form.name.trim() || !form.prefix.trim()}
              className="px-5 py-2 text-sm font-semibold rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
              {submitting ? (mode === 'create' ? 'Creating…' : 'Saving…') : (mode === 'create' ? 'Create project' : 'Save changes')}
            </button>
          </div>
        </form>
    </ModalBase>
  )
}

type SortKey = 'prefix' | 'name' | 'items' | 'description'
type SortDir = 'asc' | 'desc'
type ViewMode = 'list' | 'grid'

export function ProjectsView() {
  const { data: projects = [] } = useProjects()
  const { data: items = [] } = useItems()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const [selectedProject, setSelectedProjectId] = useSelectedProject()

  type ModalState =
    | { open: false }
    | { open: true; mode: 'create' }
    | { open: true; mode: 'edit'; project: Project }
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [sortKey, setSortKey] = usePersistentState<SortKey>('cumin:projects:sortKey', 'name')
  const [sortDir, setSortDir] = usePersistentState<SortDir>('cumin:projects:sortDir', 'asc')
  const [viewMode, setViewMode] = usePersistentState<ViewMode>('cumin:projects:viewMode', 'grid')

  function openCreate() { setFormError(''); setModal({ open: true, mode: 'create' }) }
  function openEdit(project: Project) { setFormError(''); setModal({ open: true, mode: 'edit', project }) }
  function closeModal() { setModal({ open: false }) }

  async function handleSubmit(form: FormState) {
    setFormError('')
    setSubmitting(true)
    try {
      if (modal.open && modal.mode === 'create') {
        const created = await createProject.mutateAsync({ name: form.name, prefix: form.prefix, color: form.color, description: form.description })
        // Auto-switch to the newly created project
        if (created?.id) setSelectedProjectId(created.id)
      } else if (modal.open && modal.mode === 'edit') {
        await updateProject.mutateAsync({ id: modal.project.id, payload: { name: form.name, prefix: form.prefix, color: form.color, description: form.description } })
      }
      closeModal()
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDelete() {
    if (!confirmDelete) return
    // If deleting the active project, clear selection (context will fall back to projects[0])
    if (selectedProject?.id === confirmDelete.id) setSelectedProjectId('')
    deleteProject.mutate(confirmDelete.id)
    setConfirmDelete(null)
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const projectsWithCount = useMemo(() =>
    projects.map((p) => ({ project: p, itemCount: items.filter((i) => i.project_id === p.id).length })),
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

  function thClass(key: SortKey) {
    return `text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line cursor-pointer select-none hover:text-ink transition-colors ${sortKey === key ? 'text-ink' : ''}`
  }

  const initialForModal: FormState = modal.open && modal.mode === 'edit'
    ? { name: modal.project.name, prefix: modal.project.prefix, color: modal.project.color, description: modal.project.description }
    : EMPTY_FORM

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {modal.open && (
        <ProjectFormModal
          mode={modal.mode}
          initial={initialForModal}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting}
          error={formError}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.name}"?`}
          description="All items in this project will be moved to trash."
          confirmLabel="Delete project"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <PageToolbar className="justify-between">
        <span className="text-xs text-ghost">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
        <div className="flex items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button
            onClick={openCreate}
            className="text-sm font-medium px-3 py-1.5 rounded-[var(--c-radius-card)] transition-colors bg-accent text-white hover:opacity-90"
          >
            + New project
          </button>
        </div>
      </PageToolbar>

      <div className="flex-1 overflow-auto">
        {viewMode === 'list' ? (
          <table className="w-full border-collapse" style={{ minWidth: 600 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-panel">
                <th className={thClass('prefix')} style={{ width: 90 }} onClick={() => handleSort('prefix')}>
                  Prefix<SortIcon active={sortKey === 'prefix'} dir={sortDir} />
                </th>
                <th className={thClass('name')} onClick={() => handleSort('name')}>
                  Project<SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                <th className={thClass('description')} style={{ width: 220 }} onClick={() => handleSort('description')}>
                  Description<SortIcon active={sortKey === 'description'} dir={sortDir} />
                </th>
                <th className={thClass('items')} style={{ width: 80 }} onClick={() => handleSort('items')}>
                  Items<SortIcon active={sortKey === 'items'} dir={sortDir} />
                </th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ project: p, itemCount }) => {
                const isActive = p.id === selectedProject?.id
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`group border-b transition-colors border-line cursor-pointer ${isActive ? 'bg-accent/5' : 'hover:bg-surface'}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: p.color + '18', color: p.color }}>
                        {p.prefix}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-sm font-semibold text-ink">{p.name}</span>
                        {isActive && <span className="text-[10px] font-semibold uppercase tracking-wider text-accent/70 border border-accent/30 rounded px-1.5 py-0.5">Active</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-dim">{p.description || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-ink/80">{itemCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(p) }}
                          className="p-1.5 rounded text-dim hover:text-ink hover:bg-line transition-colors"
                          title="Edit project"
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: p.id, name: p.name }) }}
                          className="p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete project"
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <p className="text-sm text-ghost mb-3">No projects yet.</p>
                    <button onClick={openCreate}
                      className="text-sm font-medium px-4 py-2 rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90">
                      Create your first project
                    </button>
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
                isActive={p.id === selectedProject?.id}
                onActivate={() => setSelectedProjectId(p.id)}
                onEdit={() => openEdit(p)}
                onDelete={() => setConfirmDelete({ id: p.id, name: p.name })}
              />
            ))}
            {sorted.length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-sm text-ghost mb-3">No projects yet.</p>
                <button onClick={openCreate}
                  className="text-sm font-medium px-4 py-2 rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90">
                  Create your first project
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectCard({
  project: p,
  itemCount,
  isActive,
  onActivate,
  onEdit,
  onDelete,
}: {
  project: Project
  itemCount: number
  isActive: boolean
  onActivate: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onActivate}
      className={`rounded-[var(--c-radius-card)] border overflow-hidden flex flex-col group cursor-pointer transition-all ${isActive ? 'bg-accent/5 border-accent/40 shadow-sm' : 'bg-surface hover:bg-raised border-line hover:border-line/80'}`}
    >
      {/* Color band — the primary visual anchor for this project */}
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: p.color }} />

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-base font-bold text-ink leading-tight">{p.name}</span>
          <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
            style={{ backgroundColor: p.color + '20', color: p.color }}>
            {p.prefix}
          </span>
        </div>

        {p.description
          ? <p className="text-xs text-dim line-clamp-2 flex-1">{p.description}</p>
          : <div className="flex-1" />}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ghost">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            {isActive && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent/80 border border-accent/30 rounded px-1.5 py-0.5">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="p-1.5 rounded text-dim hover:text-ink hover:bg-line transition-colors"
              title="Edit"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
