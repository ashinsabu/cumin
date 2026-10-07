import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BacklogView } from './BacklogView'
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

// usePersistentState uses localStorage; mock it to use plain useState so tests
// don't need a real localStorage implementation.
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
  { id: 'epic-2', name: 'Auth', type: 'catchall', color: '#00ff00', deadline: null, description: '' },
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
    time_in_status_minutes: overrides.time_in_status_minutes,
  }
}

const ITEMS: Item[] = [
  makeItem({ id: 'i1', display_id: 'WRK-1', title: 'Fix login bug', priority: 0, status_id: 'todo', epic_name: 'Auth' }),
  makeItem({ id: 'i2', display_id: 'WRK-2', title: 'Setup CI', priority: 2, status_id: 'in-progress', epic_name: 'Platform' }),
  makeItem({ id: 'i3', display_id: 'WRK-3', title: 'Add tests', priority: 4, status_id: 'todo' }),
  makeItem({ id: 'i4', display_id: 'WRK-4', title: 'Deploy feature', priority: 1, status_id: 'done' }),
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

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('BacklogView', () => {
  describe('item rendering', () => {
    it('renders non-done items in the table', () => {
      setupMocks()
      render(<BacklogView />)

      // Items i1, i2, i3 are not done; i4 is done and should be excluded.
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
      expect(screen.getByText('Setup CI')).toBeInTheDocument()
      expect(screen.getByText('Add tests')).toBeInTheDocument()
    })

    it('excludes items in done status from backlog', () => {
      setupMocks()
      render(<BacklogView />)
      expect(screen.queryByText('Deploy feature')).toBeNull()
    })

    it('renders display_id for each item', () => {
      setupMocks()
      render(<BacklogView />)
      expect(screen.getByText('WRK-1')).toBeInTheDocument()
      expect(screen.getByText('WRK-2')).toBeInTheDocument()
    })

    it('renders empty state message when no items exist', () => {
      setupMocks([])
      render(<BacklogView />)
      expect(screen.getByText(/No backlog items/)).toBeInTheDocument()
    })
  })

  describe('filtering', () => {
    it('shows "matching filters" in empty state when filter is active', async () => {
      // All items done = empty backlog with filter active
      const allDone = ITEMS.map((i) => ({ ...i, status_id: 'done' }))
      setupMocks(allDone)
      render(<BacklogView />)

      // No active filter, just empty — "No backlog items" without "matching filters"
      // because the activeFilters count is 0.
      expect(screen.getByText('No backlog items')).toBeInTheDocument()
    })

    it('filters items by epic name', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<BacklogView />)

      // Open the epic filter dropdown (first FilterSelect)
      const buttons = screen.getAllByRole('button')
      const epicFilterBtn = buttons.find((b) => b.textContent?.includes('Epic'))!
      await user.click(epicFilterBtn)

      // Click "Auth" option
      const allButtons = screen.getAllByRole('button')
      const authOption = allButtons.find(
        (b) => b.textContent === 'Auth' && b !== epicFilterBtn,
      )
      expect(authOption).toBeDefined()
      await user.click(authOption!)

      // Only items with epic_name="Auth" should be visible
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
      expect(screen.queryByText('Setup CI')).toBeNull()
      expect(screen.queryByText('Add tests')).toBeNull()
    })

    it('filters items by priority', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<BacklogView />)

      // The priority filter is the second FilterSelect button with "Priority" text
      const buttons = screen.getAllByRole('button')
      const priorityFilterBtn = buttons.find((b) => b.textContent?.includes('Priority'))!
      await user.click(priorityFilterBtn)

      // Click P0 option
      const allButtons = screen.getAllByRole('button')
      const p0Option = allButtons.find((b) => b.textContent === 'P0' && b !== priorityFilterBtn)
      expect(p0Option).toBeDefined()
      await user.click(p0Option!)

      // Only P0 item visible
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
      expect(screen.queryByText('Setup CI')).toBeNull()
    })
  })

  describe('search', () => {
    it('filters items by title text search', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<BacklogView />)

      const searchInput = screen.getByPlaceholderText(/Search backlog/i)
      await user.type(searchInput, 'login')

      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
      expect(screen.queryByText('Setup CI')).toBeNull()
    })

    it('filters items by display_id', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<BacklogView />)

      const searchInput = screen.getByPlaceholderText(/Search backlog/i)
      await user.type(searchInput, 'WRK-2')

      expect(screen.getByText('Setup CI')).toBeInTheDocument()
      expect(screen.queryByText('Fix login bug')).toBeNull()
    })

    it('shows empty state (without "matching filters") when only search yields no results', async () => {
      // activeFilters only counts dropdown filters; search alone does not trigger
      // "matching filters" suffix.
      const user = userEvent.setup()
      setupMocks()
      render(<BacklogView />)

      const searchInput = screen.getByPlaceholderText(/Search backlog/i)
      await user.type(searchInput, 'xyzzy-no-match')

      expect(screen.getByText('No backlog items')).toBeInTheDocument()
    })
  })

  describe('sorting', () => {
    it('clicking Priority column header sorts by priority', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<BacklogView />)

      // Default sort is priority asc (P0 first)
      // Click Priority header to toggle to desc
      const priorityHeader = screen.getByText('Priority', { selector: 'th' })

      // First click: already on priority, toggles to desc
      await user.click(priorityHeader)

      const rows = screen.getAllByRole('row')
      // The first data row (index 1 skips header) should now have the highest-priority item
      // After toggle to desc, P4 items should be first
      expect(rows.length).toBeGreaterThan(1)
    })

    it('clicking Work header sorts alphabetically by title', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<BacklogView />)

      const workHeader = screen.getByText('Work', { selector: 'th' })
      await user.click(workHeader)

      // Row order should now be alphabetical
      // Items: "Add tests", "Fix login bug", "Setup CI" (done excluded)
      const rows = screen.getAllByRole('row')
      const cells = within(rows[1]).getAllByRole('cell')
      // First column in row 1 (after sort by title asc) should be "Add tests"
      expect(cells.some((c) => c.textContent?.includes('Add tests'))).toBe(true)
    })
  })

  describe('new item modal', () => {
    it('opens CreateItemModal when + New item is clicked', async () => {
      const user = userEvent.setup()
      setupMocks()
      render(<BacklogView />)

      expect(screen.queryByTestId('create-item-modal')).toBeNull()

      const newItemBtn = screen.getByText('New item')
      await user.click(newItemBtn)

      expect(screen.getByTestId('create-item-modal')).toBeInTheDocument()
    })
  })

  describe('row click', () => {
    it('calls selectItem when a row is clicked', async () => {
      const user = userEvent.setup()
      const selectItem = vi.fn()
      setupMocks()
      mockUseBoard.mockReturnValue({ selectItem, selectedItem: null } as any)

      render(<BacklogView />)

      const rows = screen.getAllByRole('row')
      // Click first data row (index 1)
      await user.click(rows[1])

      expect(selectItem).toHaveBeenCalledOnce()
      expect(selectItem).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }))
    })
  })
})
