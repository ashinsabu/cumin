export type Status = {
  id: string
  name: string
  is_done: boolean
  is_initial: boolean
  position: number
}

export type Epic = {
  id: string
  name: string
  type: 'recurring' | 'goal' | 'catchall'
  color: string
  deadline: string | null
  description: string
}

export type Item = {
  id: string
  display_id: string
  title: string
  description?: string
  epic_id: string
  epic_name: string
  epic_color: string
  priority: number
  estimate_minutes: number | null
  status_id: string
  time_in_status_minutes: number
  deadline: string | null
  sprints: string[]
  created_at?: string
}

export type Sprint = {
  id: string
  name: string
  start_date: string
  end_date: string
  state: 'planning' | 'active' | 'completed'
}

export type Board = {
  id: string
  name: string
  sprint_cadence_days: number
  available_hours_per_sprint: number
}

export type PriorityConfig = {
  label: string
  color: string
  bg: string
}

export type NavEntry = {
  id: string
  label: string
  icon: string
  component: React.ComponentType
}
