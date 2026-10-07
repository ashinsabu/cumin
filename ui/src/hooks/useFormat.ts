// Parses "2h", "30m", "1h30m", "90m", "1.5h", "2d", "1.5d" → minutes. Returns null if unparseable.
export function parseEstimate(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  const dOnly = s.match(/^(\d+(?:\.\d+)?)d$/)
  if (dOnly) return Math.round(parseFloat(dOnly[1]) * 1440)
  const full = s.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m)?$/)
  if (full) return Math.round(parseFloat(full[1]) * 60) + (full[2] ? parseInt(full[2]) : 0)
  const mOnly = s.match(/^(\d+)m$/)
  if (mOnly) return parseInt(mOnly[1])
  const num = s.match(/^(\d+(?:\.\d+)?)$/)
  if (num) return Math.round(parseFloat(num[1]) * 60)
  return null
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

export function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
