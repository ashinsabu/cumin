import { useState, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useBoard } from '../context/BoardContext'
import { useItems, useMoveItem } from '../hooks/useItems'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { ItemCard } from '../components/ItemCard'
import type { Status } from '../types'

// Middle column tints cycle: red first (blocked-like), then blue (in-progress-like), then remainder
const MIDDLE_TINTS = [
  'bg-red-500/[0.08] border-red-500/15',
  'bg-blue-500/[0.08] border-blue-500/15',
  'bg-amber-500/[0.08] border-amber-500/15',
  'bg-violet-500/[0.08] border-violet-500/15',
]

function columnTint(status: Status, middleIdx: number): string {
  if (status.is_initial) return 'bg-zinc-500/[0.07] border-zinc-500/15'
  if (status.is_done) return 'bg-emerald-500/[0.08] border-emerald-500/15'
  return MIDDLE_TINTS[middleIdx % MIDDLE_TINTS.length]
}

export function BoardView() {
  const { selectItem } = useBoard()
  const { data: items = [] } = useItems()
  const { data: statuses = [] } = useBoardStatuses()
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

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 p-4 min-h-full">
          {statuses.map((status, idx) => {
            const columnItems = displayItems.filter((i) => i.status_id === status.id)
            const middleIdx = statuses.slice(0, idx).filter((s) => !s.is_initial && !s.is_done).length
            const tint = columnTint(status, middleIdx)
            return (
              <div key={status.id} className="min-w-[200px] flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-dim">
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
                      className={`flex flex-col gap-2 flex-1 rounded-[var(--c-radius-card)] p-2.5 min-h-[200px] transition-colors border ${
                        snapshot.isDraggingOver
                          ? 'bg-accent/5 border-accent/20'
                          : tint
                      }`}
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
