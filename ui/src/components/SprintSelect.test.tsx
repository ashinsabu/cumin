import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../hooks/useSprints', () => ({
  useSprints: () => ({
    data: [
      { id: 's1', project_id: 'p1', name: 'Sprint 1', sprint_number: 1, state: 'completed' },
      { id: 's2', project_id: 'p1', name: 'Sprint 2', sprint_number: 2, state: 'active' },
      { id: 's3', project_id: 'p1', name: 'Sprint 3', sprint_number: 3, state: 'planning' },
      { id: 's9', project_id: 'other', name: 'Other project sprint', sprint_number: 1, state: 'planning' },
    ],
  }),
}))
vi.mock('./FilterSelect', () => ({
  FilterSelect: ({ options }: { options: { value: string; label: string }[] }) => (
    <ul>{options.map((o) => <li key={o.value}>{o.label}</li>)}</ul>
  ),
}))

import { SprintSelect } from './SprintSelect'

// Sprint membership is a choice: backlog by default, and only this project's open sprints are offered
// (the API rejects a sprint from another project).
describe('SprintSelect', () => {
  it('offers backlog plus the project\'s open sprints only', () => {
    render(<SprintSelect projectId="p1" value="__none__" onChange={() => {}} />)
    expect(screen.getByText('Backlog (no sprint)')).toBeTruthy()
    expect(screen.getByText('Sprint 2 · active')).toBeTruthy()
    expect(screen.getByText('Sprint 3')).toBeTruthy()
    expect(screen.queryByText('Sprint 1')).toBeNull()
    expect(screen.queryByText('Other project sprint')).toBeNull()
  })
  it('keeps the item\'s current sprint listed even when completed', () => {
    render(<SprintSelect projectId="p1" value="s1" onChange={() => {}} />)
    expect(screen.getByText('Sprint 1')).toBeTruthy()
  })
})
