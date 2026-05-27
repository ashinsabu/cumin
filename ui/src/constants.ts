import type { Item, Status, Epic, Sprint, Board, PriorityConfig } from './types'

export const PRIORITY: Record<number, PriorityConfig> = {
  0: { label: 'P0', color: '#dc2626', bg: '#fef2f2' },
  1: { label: 'P1', color: '#ea580c', bg: '#fff7ed' },
  2: { label: 'P2', color: '#ca8a04', bg: '#fefce8' },
  3: { label: 'P3', color: '#2563eb', bg: '#eff6ff' },
  4: { label: 'P4', color: '#6b7280', bg: '#f9fafb' },
}

export const MOCK_BOARD: Board = {
  id: 'board-1',
  name: 'Life',
  sprint_cadence_days: 7,
  available_hours_per_sprint: 20,
}

export const MOCK_SPRINT: Sprint = {
  id: 'sprint-1',
  name: 'Sprint 1',
  start_date: '2026-05-26',
  end_date: '2026-06-01',
  state: 'active',
}

export const MOCK_STATUSES: Status[] = [
  { id: '1', name: 'TO DO', is_done: false, is_initial: true, position: 0 },
  { id: '2', name: 'BLOCKED', is_done: false, is_initial: false, position: 1 },
  { id: '3', name: 'IN PROGRESS', is_done: false, is_initial: false, position: 2 },
  { id: '4', name: 'DONE', is_done: true, is_initial: false, position: 3 },
]

export const MOCK_EPICS: Epic[] = [
  { id: 'e1', name: 'Cumin MVP', type: 'goal', color: '#7c3aed', deadline: '2026-07-01', description: 'Build the sprint board app' },
  { id: 'e2', name: 'Gym', type: 'recurring', color: '#16a34a', deadline: null, description: '3-4 sessions per sprint' },
  { id: 'e3', name: 'Interview Prep', type: 'goal', color: '#dc2626', deadline: '2026-06-15', description: 'Algorithms, system design, behavioral' },
  { id: 'e4', name: 'Catchall Q2', type: 'catchall', color: '#6b7280', deadline: '2026-06-30', description: 'One-off tasks for Q2' },
]

export const MOCK_ITEMS: Item[] = [
  { id: '1', display_id: 'ASH-1', title: 'Design data models for Cumin', epic_id: 'e1', epic_name: 'Cumin MVP', epic_color: '#7c3aed', priority: 1, estimate_minutes: 120, status_id: '4', time_in_status_minutes: 30, deadline: null, sprints: ['Sprint 1'] },
  { id: '2', display_id: 'ASH-2', title: 'Set up Vite + React frontend', epic_id: 'e1', epic_name: 'Cumin MVP', epic_color: '#7c3aed', priority: 1, estimate_minutes: 60, status_id: '3', time_in_status_minutes: 45, deadline: null, sprints: ['Sprint 1'] },
  { id: '3', display_id: 'ASH-3', title: 'Gym session - upper body', epic_id: 'e2', epic_name: 'Gym', epic_color: '#16a34a', priority: 2, estimate_minutes: 60, status_id: '1', time_in_status_minutes: 1440, deadline: null, sprints: ['Sprint 1'] },
  { id: '4', display_id: 'ASH-4', title: 'Leetcode - binary search variations', epic_id: 'e3', epic_name: 'Interview Prep', epic_color: '#dc2626', priority: 0, estimate_minutes: 90, status_id: '1', time_in_status_minutes: 4320, deadline: '2026-06-15', sprints: ['Sprint 1'] },
  { id: '5', display_id: 'ASH-5', title: 'Fix kitchen tap', epic_id: 'e4', epic_name: 'Catchall Q2', epic_color: '#6b7280', priority: 3, estimate_minutes: null, status_id: '2', time_in_status_minutes: 10080, deadline: null, sprints: ['Sprint 1', 'Sprint 2', 'Sprint 3'] },
  { id: '6', display_id: 'ASH-6', title: 'Read DDIA chapter 5', epic_id: 'e3', epic_name: 'Interview Prep', epic_color: '#dc2626', priority: 1, estimate_minutes: 120, status_id: '1', time_in_status_minutes: 2880, deadline: '2026-06-10', sprints: ['Sprint 1'] },
]
