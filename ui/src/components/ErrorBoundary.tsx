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
        <div className="h-screen flex flex-col items-center justify-center gap-3 bg-[#111218] text-gray-400">
          <span className="text-2xl">⚠</span>
          <p className="text-sm font-medium text-gray-300">Something went wrong</p>
          <p className="text-[11px] font-mono text-gray-500 max-w-sm text-center">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 text-[12px] px-4 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
