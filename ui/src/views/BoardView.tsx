import { useState, useMemo, useRef, useEffect, forwardRef } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useBoard } from '../context/BoardContext'
import { useItems, useMoveItem } from '../hooks/useItems'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { useSelectedProject } from '../hooks/useSelectedProject'
import { useProjects } from '../hooks/useProjects'
import { useActiveSprint } from '../hooks/useSprints'
import { ItemCard } from '../components/ItemCard'
import { statusDisplayColor } from '../components/ui'
import type { Project } from '../types/index'

type FilterDropdownProps = {
  projects: Project[]
  filteredIds: Set<string>
  isAll: boolean
  filterLabel: string
  showFilter: boolean
  onToggle: () => void
  onToggleProject: (id: string) => void
  onSelectAll: () => void
}

const ProjectFilterDropdown = forwardRef<HTMLDivElement, FilterDropdownProps>(function ProjectFilterDropdown(
  { projects, filteredIds, isAll, filterLabel, showFilter, onToggle, onToggleProject, onSelectAll },
  ref,
) {
  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-[var(--c-radius-card)] border transition-colors ${
          !isAll ? 'border-accent/40 text-accent bg-accent/5 hover:bg-accent/10' : 'border-line text-dim hover:bg-surface hover:text-ink'
        }`}
      >
        <span>{filterLabel}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" className={`transition-transform ${showFilter ? 'rotate-180' : ''}`}>
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {showFilter && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-raised border border-line rounded-[var(--c-radius-card)] shadow-lg py-1 min-w-[160px]">
          <button
            onClick={onSelectAll}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left hover:bg-surface transition-colors"
          >
            <span className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 transition-colors ${isAll ? 'bg-accent border-accent' : 'border-line'}`}>
              {isAll && <svg width="7" height="5" viewBox="0 0 7 5" fill="none"><path d="M1 2.5l1.5 1.5L6 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </span>
            <span className="text-dim">All projects</span>
          </button>
          <div className="border-t border-line/30 my-0.5" />
          {projects.map(p => {
            const checked = filteredIds.has(p.id)
            return (
              <button
                key={p.id}
                onClick={() => onToggleProject(p.id)}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left hover:bg-surface transition-colors"
              >
                <span className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-accent border-accent' : 'border-line'}`}>
                  {checked && <svg width="7" height="5" viewBox="0 0 7 5" fill="none"><path d="M1 2.5l1.5 1.5L6 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#6b7280' }} />
                <span className="flex-1 truncate text-ink">{p.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})

export function BoardView() {
  const { selectItem } = useBoard()
  const [selectedProject] = useSelectedProject()
  const { data: projects = [] } = useProjects()
  const { data: allItems = [] } = useItems({})
  const { data: statuses = [] } = useBoardStatuses()
  const { data: activeSprint } = useActiveSprint()
  const moveItem = useMoveItem()

  // Project filter — defaults to current project scope, user can add/remove others
  const [filteredIds, setFilteredIds] = useState<Set<string>>(() =>
    selectedProject?.id ? new Set([selectedProject.id]) : new Set<string>()
  )
  const [showFilter, setShowFilter] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  // If selectedProject loads after mount (async), seed the filter once
  useEffect(() => {
    if (selectedProject?.id && filteredIds.size === 0) {
      setFilteredIds(new Set([selectedProject.id]))
    }
  }, [selectedProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showFilter) return
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilter])

  // isAll = no explicit filter (empty set = show everything)
  const isAll = filteredIds.size === 0
  const filterLabel = isAll
    ? 'All projects'
    : filteredIds.size === 1
      ? (projects.find(p => filteredIds.has(p.id))?.name ?? '1 project')
      : `${filteredIds.size} projects`

  const toggleProject = (id: string) => {
    setFilteredIds(prev => {
      if (prev.size === 0) {
        // In "All" mode — switch to specific mode with just this project
        return new Set([id])
      }
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev // keep at least one checked
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // pendingMoves is the source of truth for in-flight drags. It's pure React
  // state — synchronous, never touched by network responses — so it can never
  // be overwritten by a stale GET /api/items completing after the drop.
  // onMutate still updates the TanStack cache (for ItemModal etc.) but can now
  // properly await cancelQueries without racing against this visual state.
  const [pendingMoves, setPendingMoves] = useState<Record<string, string>>({})

  const items = useMemo(
    () => isAll ? allItems : allItems.filter(i => i.project_id && filteredIds.has(i.project_id)),
    [allItems, filteredIds, isAll],
  )

  const displayItems = useMemo(
    () => items.map((i) => (pendingMoves[i.id] ? { ...i, status_id: pendingMoves[i.id] } : i)),
    [items, pendingMoves],
  )

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const { draggableId: id, destination: { droppableId: statusId } } = result
    // Synchronous React state update — commits in the same render batch as
    // handleDragEnd returning, before dnd releases the card. Immune to any
    // concurrent network response overwriting the TanStack cache.
    setPendingMoves((prev) => ({ ...prev, [id]: statusId }))
    moveItem.mutate({ id, statusId }, {
      onSettled: () => setPendingMoves((prev) => { const { [id]: _, ...rest } = prev; return rest }),
    })
  }

  const doneItems = statuses.length
    ? items.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done)
    : []
  const timeProgress = activeSprint
    ? Math.min(100, Math.round(
        (Date.now() - new Date(activeSprint.start_date).getTime()) /
        (new Date(activeSprint.end_date).getTime() - new Date(activeSprint.start_date).getTime()) * 100
      ))
    : 0
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const daysLeft = activeSprint
    ? Math.ceil((new Date(activeSprint.end_date).getTime() - Date.now()) / 86400000)
    : null

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {activeSprint ? (
        <div className="shrink-0 border-b border-line bg-surface">
          <div className="flex items-center gap-4 px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">{activeSprint.name}</span>
            <span className="text-xs text-dim">{fmtDate(activeSprint.start_date)} – {fmtDate(activeSprint.end_date)}</span>
            {daysLeft !== null && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                daysLeft <= 1 ? 'bg-red-500/10 text-red-400' :
                daysLeft <= 3 ? 'bg-amber-500/10 text-amber-400' :
                'bg-line text-dim'
              }`}>
                {daysLeft <= 0 ? 'Overdue' : `${daysLeft}d left`}
              </span>
            )}
            <span className="text-xs text-dim">
              <span className="font-medium text-ink/70">{doneItems.length}/{items.length}</span> done
            </span>
            <ProjectFilterDropdown
              ref={filterRef}
              projects={projects}
              filteredIds={filteredIds}
              isAll={isAll}
              filterLabel={filterLabel}
              showFilter={showFilter}
              onToggle={() => setShowFilter(s => !s)}
              onToggleProject={toggleProject}
              onSelectAll={() => setFilteredIds(new Set())}
            />
          </div>
          <div className="h-0.5 bg-line">
            <div className="h-full bg-dim/40 transition-all duration-500" style={{ width: `${timeProgress}%` }} />
          </div>
        </div>
      ) : (
        <div className="shrink-0 flex items-center gap-4 px-4 py-2.5 border-b border-line bg-surface">
          <span className="text-xs text-ghost/60">No active sprint</span>
          <ProjectFilterDropdown
            ref={filterRef}
            projects={projects}
            filteredIds={filteredIds}
            isAll={isAll}
            filterLabel={filterLabel}
            showFilter={showFilter}
            onToggle={() => setShowFilter(s => !s)}
            onToggleProject={toggleProject}
            onSelectAll={() => setFilteredIds(new Set())}
          />
        </div>
      )}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 p-4 min-h-full">
          {statuses.map((status, idx) => {
            const columnItems = displayItems.filter((i) => i.status_id === status.id)
            const middleIdx = statuses.slice(0, idx).filter((s) => !s.is_initial && !s.is_done).length
            const color = statusDisplayColor(status, middleIdx)
            return (
              <div key={status.id} className="min-w-[200px] flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
                    {status.name}
                  </h3>
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-full text-dim bg-line">
                    {columnItems.length}
                  </span>
                </div>
                <Droppable droppableId={status.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex flex-col gap-2 flex-1 rounded-[var(--c-radius-card)] p-2.5 min-h-[200px] transition-colors border`}
                      style={snapshot.isDraggingOver
                        ? { backgroundColor: 'var(--c-accent, #6366f1)08', borderColor: 'var(--c-accent, #6366f1)30' }
                        : { backgroundColor: color + '0d', borderColor: color + '25' }}
                    >
                      {columnItems.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => !snapshot.isDragging && selectItem(item)}
                              className={snapshot.isDragging ? 'opacity-90 rotate-1' : ''}
                            >
                              <ItemCard item={item} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </div>
    </DragDropContext>
  )
}
