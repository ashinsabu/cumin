import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BoardView } from './BoardView'
import type { Item, Status } from '../types'

// ─── Module mocks ─────────────────────────────────────────────────────────────

let capturedOnDragEnd: ((result: any) => void) | null = null

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: any) => {
    capturedOnDragEnd = onDragEnd
    return <div data-testid="drag-context">{children}</div>
  },
  Droppable: ({ children, droppableId }: any) =>
    children(
      { innerRef: () => {}, droppableProps: { 'data-droppable-id': droppableId }, placeholder: null },
      { isDraggingOver: false },
    ),
  Draggable: ({ children, draggableId }: any) =>
    children(
      { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} },
      { isDragging: false },
    ),
}))

vi.mock('../hooks/useItems', () => ({
  useItems: vi.fn(),
  useMoveItem: vi.fn(),
  itemKeys: { all: ['items'], list: () => ['items'], backlog: ['items', 'backlog'] },
}))

vi.mock('../hooks/useBoardQueries', () => ({
  useBoardStatuses: vi.fn(),
}))

vi.mock('../context/BoardContext', () => ({
  useBoard: vi.fn(),
}))

vi.mock('../components/ItemCard', () => ({
  ItemCard: ({ item }: { item: Item }) => (
    <div data-testid={`item-card-${item.id}`} data-status={item.status_id}>
      {item.title}
    </div>
  ),
}))

import { useItems, useMoveItem } from '../hooks/useItems'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { useBoard } from '../context/BoardContext'

const mockUseItems = vi.mocked(useItems)
const mockUseMoveItem = vi.mocked(useMoveItem)
const mockUseBoardStatuses = vi.mocked(useBoardStatuses)
const mockUseBoard = vi.mocked(useBoard)

// ─── Test data ────────────────────────────────────────────────────────────────

const TODO:    Status = { id: 'todo',    name: 'TODO',    is_initial: true,  is_done: false, position: 0 }
const BLOCKED: Status = { id: 'blocked', name: 'BLOCKED', is_initial: false, is_done: false, position: 1 }
const DONE:    Status = { id: 'done',    name: 'DONE',    is_initial: false, is_done: true,  position: 2 }

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    display_id: 'WRK-1',
    title: 'Test task',
    priority: 4,
    status_id: 'todo',
    position: 0,
    epic_id: null,
    sprint_id: null,
    project_id: 'proj-1',
    estimate_minutes: null,
    ...overrides,
  }
}

let mutateFn: ReturnType<typeof vi.fn>

function setupMocks(items: Item[]) {
  mutateFn = vi.fn()
  mockUseItems.mockReturnValue({ data: items } as any)
  mockUseMoveItem.mockReturnValue({ mutate: mutateFn } as any)
  mockUseBoardStatuses.mockReturnValue({ data: [TODO, BLOCKED, DONE] } as any)
  mockUseBoard.mockReturnValue({ selectItem: vi.fn() } as any)
}

function simulateDrop(draggableId: string, destinationDroppableId: string) {
  act(() => {
    capturedOnDragEnd?.({
      draggableId,
      destination: { droppableId: destinationDroppableId },
      source: { droppableId: 'todo' },
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  capturedOnDragEnd = null
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BoardView — pendingMoves (drag flicker regression)', () => {
  it('immediately shows the dragged item in the target column', () => {
    const item = makeItem({ id: 'i1', status_id: 'todo' })
    setupMocks([item])

    // Capture mutateFn before it fires so we can control settle timing.
    mutateFn = vi.fn() // don't call onSettled yet
    mockUseMoveItem.mockReturnValue({ mutate: mutateFn } as any)

    render(<BoardView />)

    // Before drag: item is in TODO column.
    expect(screen.getByTestId('item-card-i1').dataset.status).toBe('todo')

    simulateDrop('i1', 'blocked')

    // After drop: item must immediately show in BLOCKED column
    // (pendingMoves overrides cache status_id synchronously).
    expect(screen.getByTestId('item-card-i1').dataset.status).toBe('blocked')
  })

  it('removes the dragged item from the source column immediately', () => {
    const items = [
      makeItem({ id: 'i1', title: 'Task A', status_id: 'todo' }),
      makeItem({ id: 'i2', title: 'Task B', status_id: 'todo' }),
    ]
    setupMocks(items)
    mutateFn = vi.fn()
    mockUseMoveItem.mockReturnValue({ mutate: mutateFn } as any)

    render(<BoardView />)
    simulateDrop('i1', 'done')

    // i1 must now show as 'done', not 'todo'.
    expect(screen.getByTestId('item-card-i1').dataset.status).toBe('done')
    // i2 stays in todo (not affected by the move).
    expect(screen.getByTestId('item-card-i2').dataset.status).toBe('todo')
  })

  it('calls moveItem.mutate with the correct id and statusId', () => {
    const item = makeItem({ id: 'i1', status_id: 'todo' })
    setupMocks([item])

    render(<BoardView />)
    simulateDrop('i1', 'done')

    expect(mutateFn).toHaveBeenCalledWith(
      { id: 'i1', statusId: 'done' },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    )
  })

  it('clears pendingMoves when onSettled fires, falling back to cache data', () => {
    const item = makeItem({ id: 'i1', status_id: 'todo' })
    let capturedOnSettled: (() => void) | null = null

    mutateFn = vi.fn((_vars, opts) => {
      capturedOnSettled = opts?.onSettled
    })
    mockUseItems.mockReturnValue({ data: [item] } as any)
    mockUseMoveItem.mockReturnValue({ mutate: mutateFn } as any)
    mockUseBoardStatuses.mockReturnValue({ data: [TODO, BLOCKED, DONE] } as any)
    mockUseBoard.mockReturnValue({ selectItem: vi.fn() } as any)

    render(<BoardView />)
    simulateDrop('i1', 'blocked')

    // pendingMoves active: shows in blocked.
    expect(screen.getByTestId('item-card-i1').dataset.status).toBe('blocked')

    // Server updated cache to 'blocked'; now simulate onSettled clearing pendingMoves.
    // (useItems mock still returns item with status_id: 'todo' to prove pendingMoves is gone)
    act(() => { capturedOnSettled?.() })

    // After settle: pendingMoves cleared, falls back to cache (still 'todo' from mock).
    expect(screen.getByTestId('item-card-i1').dataset.status).toBe('todo')
  })

  it('does nothing when dropped outside a droppable', () => {
    const item = makeItem({ id: 'i1', status_id: 'todo' })
    setupMocks([item])

    render(<BoardView />)

    act(() => {
      capturedOnDragEnd?.({ draggableId: 'i1', destination: null })
    })

    expect(mutateFn).not.toHaveBeenCalled()
    expect(screen.getByTestId('item-card-i1').dataset.status).toBe('todo')
  })
})
