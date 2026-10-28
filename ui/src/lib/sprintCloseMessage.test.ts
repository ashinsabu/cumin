import { describe, it, expect } from 'vitest'
import { sprintCloseMessage } from './sprintCloseMessage'

// Regression (user feedback 2026-10-28): an empty sprint told the user "All items are done".
describe('sprintCloseMessage', () => {
  it('does not claim completion for an empty sprint', () => {
    const msg = sprintCloseMessage({ count: 0, done: 0, total: 0 })
    expect(msg).toMatch(/no items/i)
    expect(msg).not.toMatch(/done/i)
  })
  it('says everything is done only when items exist and none carry over', () => {
    expect(sprintCloseMessage({ count: 0, done: 3, total: 3 })).toBe('All 3 items done — nothing will carry over.')
    expect(sprintCloseMessage({ count: 0, done: 1, total: 1 })).toBe('All 1 item done — nothing will carry over.')
  })
  it('reports carry-over with the done remainder', () => {
    expect(sprintCloseMessage({ count: 2, done: 1, total: 3 })).toBe(
      '2 items will carry over to the next sprint; 1 of 3 done stay in this one.',
    )
  })
})
