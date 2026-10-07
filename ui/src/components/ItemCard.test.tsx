import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemCard } from './ItemCard'
import type { Item } from '../types'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    display_id: 'WRK-42',
    title: 'Test task title',
    priority: 4,
    status_id: 'status-todo',
    position: 0,
    epic_id: null,
    sprint_id: null,
    project_id: 'proj-1',
    estimate_minutes: null,
    ...overrides,
  }
}

describe('ItemCard', () => {
  describe('basic rendering', () => {
    it('renders the item title', () => {
      render(<ItemCard item={makeItem({ title: 'Fix auth bug' })} />)
      expect(screen.getByText('Fix auth bug')).toBeInTheDocument()
    })

    it('renders the display_id', () => {
      render(<ItemCard item={makeItem({ display_id: 'AUTH-7' })} />)
      expect(screen.getByText('AUTH-7')).toBeInTheDocument()
    })
  })

  describe('priority badge', () => {
    it('renders P0 priority badge', () => {
      render(<ItemCard item={makeItem({ priority: 0 })} />)
      expect(screen.getByText('P0')).toBeInTheDocument()
    })

    it('renders P4 priority badge for default priority', () => {
      render(<ItemCard item={makeItem({ priority: 4 })} />)
      expect(screen.getByText('P4')).toBeInTheDocument()
    })

    it('renders P2 priority badge', () => {
      render(<ItemCard item={makeItem({ priority: 2 })} />)
      expect(screen.getByText('P2')).toBeInTheDocument()
    })

    it('falls back to P4 for an out-of-range priority', () => {
      // 99 is not in PRIORITY map → falls back to PRIORITY[4]
      render(<ItemCard item={makeItem({ priority: 99 })} />)
      expect(screen.getByText('P4')).toBeInTheDocument()
    })
  })

  describe('epic badge', () => {
    it('shows the epic badge when epic_name is present', () => {
      render(<ItemCard item={makeItem({ epic_name: 'Platform' })} />)
      expect(screen.getByText('PLATFORM')).toBeInTheDocument()
    })

    it('does not show an epic badge when epic_name is absent', () => {
      render(<ItemCard item={makeItem({ epic_name: undefined })} />)
      expect(screen.queryByText('PLATFORM')).toBeNull()
    })

    it('uses epic_color as inline style when epic_name is present', () => {
      const { container } = render(
        <ItemCard item={makeItem({ epic_name: 'Auth', epic_color: '#ff0000' })} />,
      )
      const badge = screen.getByText('AUTH')
      expect(badge).toBeInTheDocument()
      // Background color should incorporate epic_color
      expect(badge.getAttribute('style')).toContain('color: rgb(255, 0, 0)')
    })
  })

  describe('StatusDurationBar', () => {
    it('renders the time bar area regardless of time value', () => {
      const { container } = render(
        <ItemCard item={makeItem({ time_in_status_minutes: 120, estimate_minutes: 240 })} />,
      )
      // StatusDurationBar renders a div with style containing "width"
      const bar = container.querySelector('[style*="width"]')
      expect(bar).not.toBeNull()
    })

    it('renders a dash when time_in_status_minutes is undefined', () => {
      render(<ItemCard item={makeItem({ time_in_status_minutes: undefined })} />)
      expect(screen.getByText('—')).toBeInTheDocument()
    })
  })

  describe('estimate', () => {
    it('shows formatted estimate when estimate_minutes is set', () => {
      render(<ItemCard item={makeItem({ estimate_minutes: 60 })} />)
      expect(screen.getByText('1h')).toBeInTheDocument()
    })

    it('does not show estimate when estimate_minutes is null', () => {
      render(<ItemCard item={makeItem({ estimate_minutes: null })} />)
      // Should not throw or render garbage — just no estimate text
      expect(screen.queryByText('1h')).toBeNull()
    })
  })

  describe('spill count badge', () => {
    it('shows spill indicator when item has been in multiple sprints', () => {
      const item = makeItem({ sprints: ['s1', 's2', 's3'] }) // spillCount = 2
      render(<ItemCard item={item} />)
      expect(screen.getByText('↻2')).toBeInTheDocument()
    })

    it('does not show spill indicator for a single sprint', () => {
      const item = makeItem({ sprints: ['s1'] }) // spillCount = 0
      render(<ItemCard item={item} />)
      expect(screen.queryByText(/↻/)).toBeNull()
    })

    it('does not show spill indicator when sprints is undefined', () => {
      render(<ItemCard item={makeItem()} />)
      expect(screen.queryByText(/↻/)).toBeNull()
    })
  })

  describe('overdue badge', () => {
    it('shows overdue warning when deadline is in the past', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      render(<ItemCard item={makeItem({ deadline: yesterday })} />)
      expect(screen.getByText(new RegExp('⚠'))).toBeInTheDocument()
    })

    it('does not show overdue warning when deadline is in the future', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
      render(<ItemCard item={makeItem({ deadline: tomorrow })} />)
      expect(screen.queryByText(new RegExp('⚠'))).toBeNull()
    })
  })
})
