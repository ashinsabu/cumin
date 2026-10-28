import { useSprints } from '../hooks/useSprints'
import type { Sprint } from '../types'
import { FilterSelect } from './FilterSelect'

export const NO_SPRINT = '__none__'

/**
 * Options for choosing a sprint: "Backlog (no sprint)" plus the project's open sprints
 * (and the current one, even if completed). Empty when the project has no sprints to choose from.
 */
export function sprintOptions(sprints: Sprint[], projectId: string | null | undefined, value: string) {
  const open = sprints
    .filter((s) => s.project_id === projectId && (s.state !== 'completed' || s.id === value))
    .sort((a, b) => a.sprint_number - b.sprint_number)
  if (open.length === 0) return []
  return [
    { value: NO_SPRINT, label: 'Backlog (no sprint)' },
    ...open.map((s) => ({ value: s.id, label: `${s.name}${s.state === 'active' ? ' · active' : ''}` })),
  ]
}

export function useSprintOptions(projectId: string | null | undefined, value: string) {
  const { data: sprints = [] } = useSprints()
  return sprintOptions(sprints, projectId, value)
}

/** Sprint membership is an explicit choice: items stay in the backlog until put in a sprint. */
export function SprintSelect({ projectId, value, onChange }: {
  projectId: string | null | undefined
  value: string
  onChange: (v: string) => void
}) {
  const options = useSprintOptions(projectId, value)
  if (options.length === 0) return null
  return <FilterSelect fullWidth value={value} onChange={onChange} options={options} />
}
