import type { PriorityConfig } from './types'

export const PRIORITY: Record<number, PriorityConfig> = {
  0: { label: 'P0', color: '#dc2626', bg: '#fef2f2' },
  1: { label: 'P1', color: '#ea580c', bg: '#fff7ed' },
  2: { label: 'P2', color: '#ca8a04', bg: '#fefce8' },
  3: { label: 'P3', color: '#2563eb', bg: '#eff6ff' },
  4: { label: 'P4', color: '#6b7280', bg: '#f9fafb' },
}
