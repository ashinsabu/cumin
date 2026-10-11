import { useState, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useBoard } from '../context/BoardContext'
import { useItems, useMoveItem } from '../hooks/useItems'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { useSelectedProject } from '../hooks/useSelectedProject'
import { useActiveSprint } from '../hooks/useSprints'
import { usePersistentState } from '../hooks/usePersistentState'
import { ItemCard } from '../components/ItemCard'
import { statusDisplayColor } from '../components/ui'
import type { Status } from '../types'

export function BoardView() {
  const { selectItem } = useBoard()
  const [selectedProject] = useSelectedProject()
  // 'project' = scoped to selected project, 'all' = all projects visible. Persisted.
  const [boardScope, setBoardScope] = usePersistentState<'project' | 'all'>('cumin:board:scope', 'project')
  const { data: items = [] } = useItems({ projectId: boardScope === 'project' ? selectedProject?.id : undefined })
  const { data: statuses = [] } = useBoardStatuses()
  const { data: activeSprint } = useActiveSprint()
  const moveItem = useMoveItem()

  // pendingMoves is the source of truth for in-flight drags. It's pure React
  // state — synchronous, never touched by network responses — so it can never
  // be overwritten by a stale GET /api/items completing after the drop.
  // onMutate still updates the TanStack cache (for ItemModal etc.) but can now
  // properly await cancelQueries without racing against this visual state.
  const [pendingMoves, setPendingMoves] = useState<Record<string, string>>({})

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
  const progress = items.length ? Math.round((doneItems.length / items.length) * 100) : 0
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const daysLeft = activeSprint
    ? Math.ceil((new Date(activeSprint.end_date).getTime() - Date.now()) / 86400000)
    : null

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {activeSprint ? (
        <div className="shrink-0 border-b border-line bg-surface">
          <div className="flex items-center gap-3 px-4 py-2 text-xs text-dim">
            <span className="font-semibold text-ink text-sm">{activeSprint.name}</span>
            <span className="text-ghost/40">·</span>
            <span>{fmtDate(activeSprint.start_date)} – {fmtDate(activeSprint.end_date)}</span>
            <span className="text-ghost/40">·</span>
            <span>
              <span className="font-semibold text-ink/80">{doneItems.length}/{items.length}</span>
              {' '}done
            </span>
            <div className="ml-auto flex items-center gap-3">
              {/* Scope toggle — persists across reloads */}
              <button
                onClick={() => setBoardScope((s) => s === 'project' ? 'all' : 'project')}
                className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-[var(--c-radius-card)] bg-line/60 hover:bg-line transition-colors"
                title={boardScope === 'project' ? 'Switch to all projects' : 'Switch to current project'}
              >
                {boardScope === 'all' ? (
                  <span className="text-dim">All projects</span>
                ) : (
                  <>
                    {selectedProject && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selectedProject.color || '#6b7280' }} />
                    )}
                    <span className="text-dim">{selectedProject?.name ?? 'Project'}</span>
                  </>
                )}
              </button>
              {daysLeft !== null && (
                <span className={`font-semibold ${
                  daysLeft <= 1 ? 'text-red-400' : daysLeft <= 3 ? 'text-amber-400' : 'text-dim'
                }`}>
                  {daysLeft <= 0 ? 'Overdue' : `${daysLeft}d left`}
                </span>
              )}
            </div>
          </div>
          {items.length > 0 && (
            <div className="h-0.5 bg-line">
              <div className="h-full bg-accent/60 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      ) : (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-surface">
          <span className="text-xs text-ghost">No active sprint</span>
          <button
            onClick={() => setBoardScope((s) => s === 'project' ? 'all' : 'project')}
            className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-[var(--c-radius-card)] bg-line/60 hover:bg-line transition-colors ml-auto"
          >
            {boardScope === 'all' ? (
              <span className="text-dim">All projects</span>
            ) : (
              <>
                {selectedProject && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selectedProject.color || '#6b7280' }} />
                )}
                <span className="text-dim">{selectedProject?.name ?? 'Project'}</span>
              </>
            )}
          </button>
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
