import { useSprints } from '../hooks/useSprints'
import { FilterSelect } from './FilterSelect'

export const NO_SPRINT = '__none__'

/**
 * Sprint membership is an explicit choice: items stay in the backlog until put in a sprint.
 * Lists the project's open sprints (plus the item's current one, even if completed).
 * Renders nothing when the project has no sprints to choose from.
 */
export function SprintSelect({ projectId, value, onChange }: {
  projectId: string | null | undefined
  value: string
  onChange: (v: string) => void
}) {
  const { data: sprints = [] } = useSprints()
  const options = sprints
    .filter((s) => s.project_id === projectId && (s.state !== 'completed' || s.id === value))
    .sort((a, b) => a.sprint_number - b.sprint_number)
  if (options.length === 0) return null
  return (
    <FilterSelect
      fullWidth
      value={value}
      onChange={onChange}
      options={[
        { value: NO_SPRINT, label: 'Backlog (no sprint)' },
        ...options.map((s) => ({ value: s.id, label: `${s.name}${s.state === 'active' ? ' · active' : ''}` })),
      ]}
    />
  )
}
