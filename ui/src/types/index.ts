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
  epic_id: string | null
  sprint_id: string | null
  project_id: string | null
  priority: number
  estimate_minutes: number | null
  status_id: string
  position: number
  created_at?: string
  updated_at?: string
  // Enriched fields (populated client-side from epics/sprints lookups)
  epic_name?: string
  epic_color?: string
  time_in_status_minutes?: number
  deadline?: string | null
  sprints?: string[]
}

export type Sprint = {
  id: string
  board_id: string
  name: string
  sprint_number: number
  start_date: string
  end_date: string
  state: 'planning' | 'active' | 'completed'
  created_at: string
  days_total: number
  days_remaining: number
}

export type Board = {
  id: string
  name: string
  sprint_cadence_days: number
  available_hours_per_sprint: number
}

export type Project = {
  id: string
  name: string
  prefix: string
  color: string
  description: string
}

export type PriorityConfig = {
  label: string
  color: string
  bg: string
}

export type NavEntry = {
  id: string
  path: string
  label: string
  icon: string
}

export type QueueItem = {
  id: string
  board_id: string
  created_by: string
  title: string
  notes: string
  deadline: string | null
  priority: number
  estimate_minutes: number | null
  position: number
  urgency_score: number
  promoted_item_id: string | null
  completed_at: string | null
  created_at: string
}
