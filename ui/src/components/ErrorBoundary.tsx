import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="h-screen flex flex-col items-center justify-center gap-3 bg-canvas text-dim">
          <span className="text-2xl">⚠</span>
          <p className="text-sm font-medium text-ink">Something went wrong</p>
          <p className="text-xs font-mono text-ghost max-w-sm text-center">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 text-sm px-4 py-1.5 rounded-[var(--c-radius-card)] bg-accent text-white hover:bg-accent/80"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
