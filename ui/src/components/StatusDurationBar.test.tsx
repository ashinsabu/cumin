import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusDurationBar } from './StatusDurationBar'

describe('StatusDurationBar', () => {
  describe('with estimate — ratio-based coloring', () => {
    it('shows green when time is under 50% of estimate', () => {
      const { container } = render(<StatusDurationBar minutes={2} estimateMinutes={10} />)
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar.style.backgroundColor).toBe('rgb(34, 197, 94)') // green
    })

    it('shows yellow at 60% of estimate', () => {
      const { container } = render(<StatusDurationBar minutes={6} estimateMinutes={10} />)
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar.style.backgroundColor).toBe('rgb(234, 179, 8)') // yellow
    })

    it('shows orange at 85% of estimate', () => {
      const { container } = render(<StatusDurationBar minutes={17} estimateMinutes={20} />)
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar.style.backgroundColor).toBe('rgb(249, 115, 22)') // orange
    })

    it('shows red when at or over 100% of estimate', () => {
      const { container } = render(<StatusDurationBar minutes={5} estimateMinutes={5} />)
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar.style.backgroundColor).toBe('rgb(220, 38, 38)') // red
    })

    it('regression: 3m in 5m task must be orange/red, not green', () => {
      // This was the reported bug — 3/5m was showing as tiny green bar
      const { container } = render(<StatusDurationBar minutes={3} estimateMinutes={5} />)
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      // 3/5 = 60% → yellow
      expect(bar.style.backgroundColor).toBe('rgb(234, 179, 8)')
    })

    it('bar width is capped at 100% even when over estimate', () => {
      const { container } = render(<StatusDurationBar minutes={20} estimateMinutes={5} />)
      const bar = container.querySelector('[style*="width"]') as HTMLElement
      expect(bar.style.width).toBe('100%')
    })
  })

  describe('without estimate — hour-based scale', () => {
    it('shows green for short durations under 2h', () => {
      const { container } = render(<StatusDurationBar minutes={45} />)
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar.style.backgroundColor).toBe('rgb(34, 197, 94)')
    })

    it('shows red for over 24h without estimate', () => {
      const { container } = render(<StatusDurationBar minutes={1500} />) // 25h
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar.style.backgroundColor).toBe('rgb(220, 38, 38)')
    })

    it('shows no bar (0 width) for 0 minutes', () => {
      const { container } = render(<StatusDurationBar minutes={0} />)
      const bar = container.querySelector('[style*="width"]') as HTMLElement
      expect(bar.style.width).toBe('0%')
    })
  })

  it('shows dash when minutes is null/undefined', () => {
    render(<StatusDurationBar minutes={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
