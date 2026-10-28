import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mutate = vi.fn()
vi.mock('../hooks/useItems', () => ({ useUpdateItem: () => ({ mutate }) }))
vi.mock('../hooks/useEpics', () => ({ useEpics: () => ({ data: [] }) }))

import { TitleCell, EstimateCell } from './ItemCells'
import type { Item } from '../types'

const item = { id: 'i1', title: 'Write docs', estimate_minutes: 60, priority: 2, epic_id: null } as unknown as Item

beforeEach(() => { mutate.mockClear() })

describe('Items table inline cells', () => {
  it('saves a parsed estimate as minutes', () => {
    render(<EstimateCell item={item} />)
    fireEvent.click(screen.getByText('1h'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '1h30m' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mutate).toHaveBeenCalledWith({ id: 'i1', payload: { estimate_minutes: 90 } })
  })

  it('clears the estimate with clear_estimate (null is "unchanged" on the server)', () => {
    render(<EstimateCell item={item} />)
    fireEvent.click(screen.getByText('1h'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mutate).toHaveBeenCalledWith({ id: 'i1', payload: { clear_estimate: true } })
  })

  it('does not save an unparseable estimate', () => {
    render(<EstimateCell item={item} />)
    fireEvent.click(screen.getByText('1h'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'soon' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled()
  })

  it('does not save an emptied title', () => {
    render(<TitleCell item={item} />)
    fireEvent.click(screen.getByText('Write docs'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled()
  })
})
