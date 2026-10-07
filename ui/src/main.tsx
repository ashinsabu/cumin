import './instrument'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { BoardProvider } from './context/BoardContext'
import { FlagsProvider } from './context/FlagsContext'
import { ToastProvider } from './context/ToastContext'
import { QueueProvider } from './context/QueueContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

createRoot(document.getElementById('root')!, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <ErrorBoundary>
      <FlagsProvider>
        <ThemeProvider>
          <BrowserRouter>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <ToastProvider>
                  <BoardProvider>
                    <QueueProvider>
                      <App />
                    </QueueProvider>
                  </BoardProvider>
                </ToastProvider>
              </AuthProvider>
              <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
          </BrowserRouter>
        </ThemeProvider>
      </FlagsProvider>
    </ErrorBoundary>
  </StrictMode>,
)
