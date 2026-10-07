import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllItemsView } from './AllItemsView'
import type { Item, Epic, Status } from '../types'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

vi.mock('../hooks/useItems', () => ({
  useItems: vi.fn(),
  itemKeys: { all: ['items'], list: () => ['items'], backlog: ['items', 'backlog'] },
}))

vi.mock('../hooks/useEpics', () => ({
  useEpics: vi.fn(),
  epicKeys: { all: ['epics'], list: () => ['epics', 'list'] },
}))

vi.mock('../hooks/useBoardQueries', () => ({
  useBoardStatuses: vi.fn(),
}))

vi.mock('../context/BoardContext', () => ({
  useBoard: vi.fn(),
}))

vi.mock('../components/CreateItemModal', () => ({
  CreateItemModal: () => <div data-testid="create-item-modal" />,
}))

vi.mock('../hooks/usePersistentState', () => ({
  usePersistentState: <T,>(_key: string, defaultValue: T) => {
    const { useState } = require('react')
    return useState<T>(defaultValue)
  },
}))

import { useItems } from '../hooks/useItems'
import { useEpics } from '../hooks/useEpics'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { useBoard } from '../context/BoardContext'

const mockUseItems = vi.mocked(useItems)
const mockUseEpics = vi.mocked(useEpics)
const mockUseBoardStatuses = vi.mocked(useBoardStatuses)
const mockUseBoard = vi.mocked(useBoard)

// ─── Test data ────────────────────────────────────────────────────────────────

const TODO_STATUS: Status = { id: 'todo', name: 'TODO', is_initial: true, is_done: false, position: 0 }
const IN_PROGRESS_STATUS: Status = { id: 'in-progress', name: 'IN PROGRESS', is_initial: false, is_done: false, position: 1 }
const DONE_STATUS: Status = { id: 'done', name: 'DONE', is_initial: false, is_done: true, position: 2 }

const EPICS: Epic[] = [
  { id: 'epic-1', name: 'Platform', type: 'goal', color: '#ff0000', deadline: null, description: '' },
]

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: overrides.id ?? 'item-1',
    display_id: overrides.display_id ?? 'WRK-1',
    title: overrides.title ?? 'Default task',
    priority: overrides.priority ?? 4,
    status_id: overrides.status_id ?? 'todo',
    position: overrides.position ?? 0,
    epic_id: overrides.epic_id ?? null,
    sprint_id: overrides.sprint_id ?? null,
    project_id: overrides.project_id ?? 'proj-1',
    estimate_minutes: overrides.estimate_minutes ?? null,
    epic_name: overrides.epic_name,
    epic_color: overrides.epic_color,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    time_in_status_minutes: overrides.time_in_status_minutes,
  }
}

const ITEMS: Item[] = [
  makeItem({ id: 'i1', display_id: 'WRK-1', title: 'Setup CI', priority: 2, status_id: 'todo', epic_name: 'Platform', created_at: '2026-01-01T00:00:00Z' }),
  makeItem({ id: 'i2', display_id: 'WRK-2', title: 'Fix auth bug', priority: 0, status_id: 'in-progress', created_at: '2026-01-02T00:00:00Z' }),
  makeItem({ id: 'i3', display_id: 'WRK-3', title: 'Deploy feature', priority: 1, status_id: 'done', created_at: '2026-01-03T00:00:00Z' }),
]

function setupMocks(items = ITEMS, epics = EPICS) {
  mockUseItems.mockReturnValue({ data: items } as any)
  mockUseEpics.mockReturnValue({ data: epics } as any)
  mockUseBoardStatuses.mockReturnValue({ data: [TODO_STATUS, IN_PROGRESS_STATUS, DONE_STATUS] } as any)
  mockUseBoard.mockReturnValue({ selectItem: vi.fn(), selectedItem: null } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AllItemsView', () => {
  describe('item rendering', () => {
    it('renders ALL items including done ones', () => {
      setupMocks()
      render(<AllItemsView />)

      expect(screen.getByText('Setup CI')).toBeInTheDocument()
      expect(screen.getByText('Fix auth bug')).toBeInTheDocument()
      expect(screen.getByText('Deploy feature')).toBeInTheDocument()
    })

    it('renders display_id for each item', () => {
      setupMocks()
      render(<AllItemsView />)

      expect(screen.getByText('WRK-1')).toBeInTheDocument()
      expect(screen.getByText('WRK-2')).toBeInTheDocument()
      expect(screen.getByText('WRK-3')).toBeInTheDocument()
    })

    it('shows empty state when no items exist', () => {
      setupMocks([])
      render(<AllItemsView />)
      expect(screen.getByText(/No items/)).toBeInTheDocument()
    })

    it('shows empty state without "matching filters" when only search yields no results', async () => {
      // activeFilters only counts dropdown filters; search alone does not append
      // "matching filters" to the empty state message.
      const user = userEvent.setup()
      setupMocks()
      render(<AllItemsView />)

      const searchInput = screen.getByPlaceholderText(/Search work/i)
      await user.type(searchInput, 'xyzzy-no-match')

      expect(screen.getByText('No items')).toBeInTheDocument()
    })
  })

  describe('status filter', () => {
    it('filters items to only the selected status', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<AllItemsView />)

      // Find the Status filter button
      const buttons = screen.getAllByRole('button')
      const statusFilterBtn = buttons.find((b) => b.textContent?.includes('Status'))!
      await user.click(statusFilterBtn)

      // Click "TODO" status option
      const allButtons = screen.getAllByRole('button')
      const todoOption = allButtons.find(
        (b) => b.textContent === 'TODO' && b !== statusFilterBtn,
      )
      expect(todoOption).toBeDefined()
      await user.click(todoOption!)

      // Only items with status_id='todo' should be visible
      expect(screen.getByText('Setup CI')).toBeInTheDocument()
      expect(screen.queryByText('Fix auth bug')).toBeNull()
      expect(screen.queryByText('Deploy feature')).toBeNull()
    })

    it('filters items to done status', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<AllItemsView />)

      const buttons = screen.getAllByRole('button')
      const statusFilterBtn = buttons.find((b) => b.textContent?.includes('Status'))!
      await user.click(statusFilterBtn)

      const allButtons = screen.getAllByRole('button')
      const doneOption = allButtons.find(
        (b) => b.textContent === 'DONE' && b !== statusFilterBtn,
      )
      expect(doneOption).toBeDefined()
      await user.click(doneOption!)

      expect(screen.queryByText('Setup CI')).toBeNull()
      expect(screen.queryByText('Fix auth bug')).toBeNull()
      expect(screen.getByText('Deploy feature')).toBeInTheDocument()
    })
  })

  describe('epic filter', () => {
    it('filters items by epic', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<AllItemsView />)

      const buttons = screen.getAllByRole('button')
      const epicFilterBtn = buttons.find((b) => b.textContent?.includes('Epic'))!
      await user.click(epicFilterBtn)

      const allButtons = screen.getAllByRole('button')
      const platformOption = allButtons.find(
        (b) => b.textContent === 'Platform' && b !== epicFilterBtn,
      )
      expect(platformOption).toBeDefined()
      await user.click(platformOption!)

      expect(screen.getByText('Setup CI')).toBeInTheDocument()
      expect(screen.queryByText('Fix auth bug')).toBeNull()
      expect(screen.queryByText('Deploy feature')).toBeNull()
    })
  })

  describe('search', () => {
    it('narrows results by title', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<AllItemsView />)

      const searchInput = screen.getByPlaceholderText(/Search work/i)
      await user.type(searchInput, 'auth')

      expect(screen.getByText('Fix auth bug')).toBeInTheDocument()
      expect(screen.queryByText('Setup CI')).toBeNull()
    })

    it('searches by display_id', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<AllItemsView />)

      const searchInput = screen.getByPlaceholderText(/Search work/i)
      await user.type(searchInput, 'WRK-3')

      expect(screen.getByText('Deploy feature')).toBeInTheDocument()
      expect(screen.queryByText('Setup CI')).toBeNull()
    })

    it('searches by epic name', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<AllItemsView />)

      const searchInput = screen.getByPlaceholderText(/Search work/i)
      await user.type(searchInput, 'platform')

      expect(screen.getByText('Setup CI')).toBeInTheDocument()
      expect(screen.queryByText('Fix auth bug')).toBeNull()
    })
  })

  describe('row interaction', () => {
    it('calls selectItem when a row is clicked', async () => {
      const user = userEvent.setup()
      const selectItem = vi.fn()
      setupMocks()
      mockUseBoard.mockReturnValue({ selectItem, selectedItem: null } as any)

      render(<AllItemsView />)

      const rows = screen.getAllByRole('row')
      await user.click(rows[1])

      expect(selectItem).toHaveBeenCalledOnce()
    })
  })

  describe('item count', () => {
    it('shows the filtered item count', () => {
      setupMocks()
      render(<AllItemsView />)
      expect(screen.getByText(/3 items/)).toBeInTheDocument()
    })
  })
})
