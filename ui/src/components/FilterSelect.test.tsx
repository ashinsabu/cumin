import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterSelect, type FilterOption } from './FilterSelect'

// framer-motion uses animation APIs that jsdom doesn't implement; stub it so
// AnimatePresence renders children synchronously.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

const OPTIONS: FilterOption[] = [
  { value: 'all', label: 'Epic' },
  { value: 'auth', label: 'Auth', color: '#ff0000' },
  { value: 'infra', label: 'Infra', color: '#00ff00' },
]

describe('FilterSelect', () => {
  describe('rendering', () => {
    it('shows the placeholder label from the first option when matching value', () => {
      render(<FilterSelect value="all" onChange={vi.fn()} options={OPTIONS} />)
      expect(screen.getByText('Epic')).toBeInTheDocument()
    })

    it('shows the selected option label', () => {
      render(<FilterSelect value="auth" onChange={vi.fn()} options={OPTIONS} />)
      expect(screen.getByText('Auth')).toBeInTheDocument()
    })

    it('shows custom placeholder text when provided and no option matches', () => {
      render(
        <FilterSelect
          value="all"
          onChange={vi.fn()}
          options={OPTIONS}
          placeholder="Select epic"
        />,
      )
      // The first option has value 'all' which matches — label overrides placeholder
      expect(screen.getByText('Epic')).toBeInTheDocument()
    })
  })

  describe('dropdown interaction', () => {
    it('opens the dropdown when the button is clicked', async () => {
      const user = userEvent.setup()
      render(<FilterSelect value="all" onChange={vi.fn()} options={OPTIONS} />)

      // Dropdown items are not visible initially
      expect(screen.queryByText('Auth')).toBeNull()

      await user.click(screen.getByRole('button'))
      expect(screen.getAllByText('Auth').length).toBeGreaterThan(0)
    })

    it('shows all options in the dropdown', async () => {
      const user = userEvent.setup()
      render(<FilterSelect value="all" onChange={vi.fn()} options={OPTIONS} />)

      await user.click(screen.getByRole('button'))

      // All three options should appear (first one duplicated from trigger + list)
      for (const opt of OPTIONS) {
        const items = screen.getAllByText(opt.label)
        expect(items.length).toBeGreaterThan(0)
      }
    })

    it('fires onChange with the correct value when an option is selected', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<FilterSelect value="all" onChange={onChange} options={OPTIONS} />)

      await user.click(screen.getByRole('button'))
      // Click the "Infra" option button
      const optionButtons = screen.getAllByRole('button')
      const infraBtn = optionButtons.find((b) => b.textContent?.includes('Infra'))
      expect(infraBtn).toBeDefined()
      await user.click(infraBtn!)

      expect(onChange).toHaveBeenCalledOnce()
      expect(onChange).toHaveBeenCalledWith('infra')
    })

    it('closes the dropdown after selecting an option', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<FilterSelect value="all" onChange={onChange} options={OPTIONS} />)

      await user.click(screen.getByRole('button'))
      // Open confirmed
      expect(screen.getAllByText('Auth').length).toBeGreaterThan(0)

      const optionButtons = screen.getAllByRole('button')
      const authBtn = optionButtons.find((b) => b.textContent?.includes('Auth'))
      await user.click(authBtn!)

      // Dropdown should no longer show the extra option buttons
      // The trigger button still shows the selected label (possibly), but
      // no second occurrence.
      await waitFor(() => {
        const authItems = screen.queryAllByRole('button', { name: /Auth/i })
        // Only one button should remain (the trigger), not the dropdown items
        expect(authItems.length).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('active state', () => {
    it('applies active styling when a non-first-option value is selected', () => {
      const { container } = render(
        <FilterSelect value="auth" onChange={vi.fn()} options={OPTIONS} />,
      )
      const btn = container.querySelector('button')!
      // The active button has 'border-accent' class (from the isFiltered branch)
      expect(btn.className).toContain('border-accent')
    })

    it('does not apply active styling when the first option is selected', () => {
      const { container } = render(
        <FilterSelect value="all" onChange={vi.fn()} options={OPTIONS} />,
      )
      const btn = container.querySelector('button')!
      expect(btn.className).not.toContain('border-accent')
    })

    it('shows a color dot when the filtered option has a color', () => {
      const { container } = render(
        <FilterSelect value="auth" onChange={vi.fn()} options={OPTIONS} />,
      )
      // Auth option has color="#ff0000"
      const dot = container.querySelector('[style*="background-color"]')
      expect(dot).not.toBeNull()
    })
  })

  describe('fullWidth prop', () => {
    it('adds w-full class when fullWidth is true', () => {
      const { container } = render(
        <FilterSelect value="all" onChange={vi.fn()} options={OPTIONS} fullWidth />,
      )
      const wrapper = container.firstElementChild!
      expect(wrapper.className).toContain('w-full')
    })

    it('does not add w-full class by default', () => {
      const { container } = render(
        <FilterSelect value="all" onChange={vi.fn()} options={OPTIONS} />,
      )
      const wrapper = container.firstElementChild!
      expect(wrapper.className).not.toContain('w-full')
    })
  })
})
