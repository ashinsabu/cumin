import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useBoard } from '../context/BoardContext'
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
  const { items, statuses, moveItem, selectItem } = useBoard()

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    moveItem(result.draggableId, result.destination.droppableId)
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 p-4 min-h-full">
          {statuses.map((status, idx) => {
            const columnItems = items.filter((i) => i.status_id === status.id)
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
