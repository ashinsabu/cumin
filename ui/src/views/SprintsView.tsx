import { useState } from 'react'
import { useItems } from '../hooks/useItems'
import {
  useSprints,
  useCreateSprint,
  useActivateSprint,
  useCloseSprint,
  useSpilloverPreview,
} from '../hooks/useSprints'
import { formatEstimate } from '../hooks/useFormat'
import type { Sprint } from '../types'

function SprintStateBadge({ state }: { state: Sprint['state'] }) {
  const styles = {
    active:    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    planning:  'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    completed: 'bg-line text-ghost border border-line',
  }
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${styles[state]}`}>
      {state}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function CloseConfirmModal({
  sprint,
  onConfirm,
  onCancel,
  loading,
}: {
  sprint: Sprint
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  const { data: spillCount, isLoading: previewLoading } = useSpilloverPreview(sprint.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="w-[380px] rounded-[var(--c-radius-card)] bg-raised border border-line shadow-xl p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-semibold text-ink">Close sprint</h3>
          <p className="text-sm text-dim mt-1">{sprint.name}</p>
        </div>

        <div className="rounded-[var(--c-radius-card)] bg-surface border border-line px-4 py-3 text-sm text-ink">
          {previewLoading ? (
            <span className="text-dim">Checking incomplete items…</span>
          ) : spillCount === 0 ? (
            <span className="text-emerald-400">All items are done — nothing will carry over.</span>
          ) : (
            <>
              <span className="font-semibold text-amber-400">{spillCount} item{spillCount !== 1 ? 's' : ''}</span>
              <span className="text-dim"> will carry over to the next sprint.</span>
            </>
          )}
        </div>

        <p className="text-xs text-ghost">
          A new planning sprint will be created automatically when this sprint is closed.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-[var(--c-radius-card)] text-sm font-medium text-dim hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || previewLoading}
            className="px-4 py-2 rounded-[var(--c-radius-card)] text-sm font-semibold bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Closing…' : 'Close sprint'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ActiveSprintCard({ sprint, items }: { sprint: Sprint; items: ReturnType<typeof useItems>['data'] }) {
  const closeSprint = useCloseSprint()
  const [confirming, setConfirming] = useState(false)

  const sprintItems = (items ?? []).filter((i) => i.sprint_id === sprint.id)
  const totalEstimate = sprintItems.reduce((s, i) => s + (i.estimate_minutes || 0), 0)

  function handleClose() {
    closeSprint.mutate(sprint.id, {
      onSuccess: () => setConfirming(false),
    })
  }

  return (
    <>
      <div className="rounded-[var(--c-radius-card)] border border-emerald-500/20 bg-emerald-500/5 p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <SprintStateBadge state="active" />
              <span className="text-xs text-ghost font-mono">#{sprint.sprint_number}</span>
            </div>
            <h2 className="text-base font-semibold text-ink">{sprint.name}</h2>
            <p className="text-xs text-dim">
              {formatDate(sprint.start_date)} – {formatDate(sprint.end_date)}
            </p>
          </div>
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 px-3 py-1.5 rounded-[var(--c-radius-card)] text-sm font-semibold border border-line text-dim hover:text-ink hover:border-accent/40 transition-colors"
          >
            Close sprint
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-dim">
            <span>{sprint.days_remaining} of {sprint.days_total} days remaining</span>
            <span>{Math.round((sprint.days_remaining / sprint.days_total) * 100)}%</span>
          </div>
          <ProgressBar value={sprint.days_remaining} total={sprint.days_total} />
        </div>

        <div className="flex items-center gap-4 text-xs text-dim">
          <span><span className="font-semibold text-ink">{sprintItems.length}</span> items</span>
          {totalEstimate > 0 && (
            <span><span className="font-semibold text-ink">{formatEstimate(totalEstimate)}</span> estimated</span>
          )}
        </div>
      </div>

      {confirming && (
        <CloseConfirmModal
          sprint={sprint}
          onConfirm={handleClose}
          onCancel={() => setConfirming(false)}
          loading={closeSprint.isPending}
        />
      )}
    </>
  )
}

function PlanningSprintCard({
  sprint,
  hasActiveSprint,
}: {
  sprint: Sprint
  hasActiveSprint: boolean
}) {
  const activateSprint = useActivateSprint()

  return (
    <div className="rounded-[var(--c-radius-card)] border border-line bg-surface p-5 flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <SprintStateBadge state="planning" />
          <span className="text-xs text-ghost font-mono">#{sprint.sprint_number}</span>
        </div>
        <h2 className="text-sm font-semibold text-ink">{sprint.name}</h2>
        <p className="text-xs text-dim">
          {formatDate(sprint.start_date)} – {formatDate(sprint.end_date)} · {sprint.days_total} days
        </p>
      </div>
      <button
        onClick={() => activateSprint.mutate(sprint.id)}
        disabled={hasActiveSprint || activateSprint.isPending}
        title={hasActiveSprint ? 'Close the active sprint before activating another' : undefined}
        className="shrink-0 px-3 py-1.5 rounded-[var(--c-radius-card)] text-sm font-semibold bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {activateSprint.isPending ? 'Activating…' : 'Activate'}
      </button>
    </div>
  )
}

function CompletedSprintRow({ sprint }: { sprint: Sprint }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-[var(--c-radius-card)] hover:bg-surface transition-colors">
      <span className="text-ghost text-xs font-mono w-12 shrink-0">#{sprint.sprint_number}</span>
      <span className="flex-1 text-sm text-dim">{sprint.name}</span>
      <span className="text-xs text-ghost">
        {formatDate(sprint.start_date)} – {formatDate(sprint.end_date)}
      </span>
      <SprintStateBadge state="completed" />
    </div>
  )
}

export function SprintsView() {
  const { data: sprints = [], isLoading } = useSprints()
  const { data: items } = useItems()
  const createSprint = useCreateSprint()
  const [showCompleted, setShowCompleted] = useState(false)

  const active    = sprints.filter((s) => s.state === 'active')
  const planning  = sprints.filter((s) => s.state === 'planning')
  const completed = sprints.filter((s) => s.state === 'completed')

  const hasActiveSprint = active.length > 0

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-dim">Loading sprints…</span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-6">

        {/* Active sprint */}
        {active.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-ghost/60">Active</h3>
            {active.map((s) => (
              <ActiveSprintCard key={s.id} sprint={s} items={items} />
            ))}
          </section>
        )}

        {/* No active sprint callout */}
        {active.length === 0 && (
          <div className="rounded-[var(--c-radius-card)] border border-dashed border-line bg-surface/50 px-5 py-4 text-sm text-dim text-center">
            No active sprint. Activate a planning sprint or create a new one to get started.
          </div>
        )}

        {/* Planning sprints */}
        {planning.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-ghost/60">Planning</h3>
            {planning.map((s) => (
              <PlanningSprintCard key={s.id} sprint={s} hasActiveSprint={hasActiveSprint} />
            ))}
          </section>
        )}

        {/* Create sprint CTA */}
        <div>
          <button
            onClick={() => createSprint.mutate()}
            disabled={createSprint.isPending}
            className="text-sm font-medium text-dim hover:text-ink transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <span className="text-base leading-none">+</span>
            {createSprint.isPending ? 'Creating…' : 'New sprint'}
          </button>
        </div>

        {/* Completed sprints — collapsed by default */}
        {completed.length > 0 && (
          <section className="flex flex-col gap-1">
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ghost/60 hover:text-dim transition-colors"
            >
              <span>{showCompleted ? '▾' : '▸'}</span>
              Completed ({completed.length})
            </button>
            {showCompleted && (
              <div className="flex flex-col mt-2">
                {completed.map((s) => (
                  <CompletedSprintRow key={s.id} sprint={s} />
                ))}
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  )
}
