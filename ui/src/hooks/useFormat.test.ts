import { describe, it, expect } from 'vitest'
import { parseEstimate, formatDuration, formatEstimate } from './useFormat'

describe('parseEstimate', () => {
  describe('minutes only (Xm)', () => {
    it('30m → 30', () => expect(parseEstimate('30m')).toBe(30))
    it('90m → 90', () => expect(parseEstimate('90m')).toBe(90))
    it('0m → 0', () => expect(parseEstimate('0m')).toBe(0))
  })

  describe('hours only (Xh)', () => {
    it('2h → 120', () => expect(parseEstimate('2h')).toBe(120))
    it('1h → 60', () => expect(parseEstimate('1h')).toBe(60))
  })

  describe('hours + minutes (XhYm)', () => {
    it('1h30m → 90', () => expect(parseEstimate('1h30m')).toBe(90))
    it('1h0m → 60', () => expect(parseEstimate('1h0m')).toBe(60))
    it('0h30m → 30', () => expect(parseEstimate('0h30m')).toBe(30))
  })

  describe('fractional hours', () => {
    it('1.5h → 90', () => expect(parseEstimate('1.5h')).toBe(90))
    it('2.5h → 150', () => expect(parseEstimate('2.5h')).toBe(150))
  })

  describe('days (Xd) — production bug fix guard', () => {
    it('1d → 1440', () => expect(parseEstimate('1d')).toBe(1440))
    it('2d → 2880', () => expect(parseEstimate('2d')).toBe(2880))
    it('1.5d → 2160', () => expect(parseEstimate('1.5d')).toBe(2160))
    it('0.5d → 720', () => expect(parseEstimate('0.5d')).toBe(720))
    it('2.5d → 3600', () => expect(parseEstimate('2.5d')).toBe(3600))
  })

  describe('bare number (treated as hours)', () => {
    it('"2" → 120', () => expect(parseEstimate('2')).toBe(120))
    it('"1.5" → 90', () => expect(parseEstimate('1.5')).toBe(90))
    it('"999" → 59940', () => expect(parseEstimate('999')).toBe(59940))
  })

  describe('whitespace handling', () => {
    it('leading/trailing spaces trimmed', () => expect(parseEstimate('  2h  ')).toBe(120))
    it('spaces only → null', () => expect(parseEstimate('   ')).toBeNull())
  })

  describe('invalid inputs → null', () => {
    it('empty string → null', () => expect(parseEstimate('')).toBeNull())
    it('"abc" → null', () => expect(parseEstimate('abc')).toBeNull())
    it('"2x" → null', () => expect(parseEstimate('2x')).toBeNull())
    it('"2h30" (no m suffix) → null', () => expect(parseEstimate('2h30')).toBeNull())
    it('negative "-1h" → null', () => expect(parseEstimate('-1h')).toBeNull())
  })

  describe('case handling — toLowerCase normalization', () => {
    it('"2H" → 120', () => expect(parseEstimate('2H')).toBe(120))
    it('"30M" → 30', () => expect(parseEstimate('30M')).toBe(30))
    it('"2D" → 2880', () => expect(parseEstimate('2D')).toBe(2880))
    it('"1H30M" → 90', () => expect(parseEstimate('1H30M')).toBe(90))
  })
})

describe('formatEstimate', () => {
  it('0 → "0m"', () => expect(formatEstimate(0)).toBe('0m'))
  it('30 → "30m"', () => expect(formatEstimate(30)).toBe('30m'))
  it('59 → "59m"', () => expect(formatEstimate(59)).toBe('59m'))
  it('60 → "1h"', () => expect(formatEstimate(60)).toBe('1h'))
  it('90 → "1h 30m"', () => expect(formatEstimate(90)).toBe('1h 30m'))
  it('120 → "2h"', () => expect(formatEstimate(120)).toBe('2h'))
  it('61 → "1h 1m"', () => expect(formatEstimate(61)).toBe('1h 1m'))
  it('150 → "2h 30m"', () => expect(formatEstimate(150)).toBe('2h 30m'))
  // formatEstimate has no day branch — 2880 renders as "48h" since minutes % 60 === 0
  it('2880 → "48h"', () => expect(formatEstimate(2880)).toBe('48h'))
})

describe('formatDuration', () => {
  it('0 → "0m"', () => expect(formatDuration(0)).toBe('0m'))
  it('30 → "30m"', () => expect(formatDuration(30)).toBe('30m'))
  it('59 → "59m"', () => expect(formatDuration(59)).toBe('59m'))
  it('60 → "1h"', () => expect(formatDuration(60)).toBe('1h'))
  it('90 → "1h"', () => expect(formatDuration(90)).toBe('1h'))
  it('1439 → "23h"', () => expect(formatDuration(1439)).toBe('23h'))
  it('1440 → "1d"', () => expect(formatDuration(1440)).toBe('1d'))
  it('2880 → "2d"', () => expect(formatDuration(2880)).toBe('2d'))
})
