import './instrument'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { BoardProvider } from './context/BoardContext'
import { FlagsProvider } from './context/FlagsContext'
import { ToastProvider } from './context/ToastContext'
import { QueueProvider } from './context/QueueContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import App from './App'

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
            <AuthProvider>
              <ToastProvider>
              <BoardProvider>
                <QueueProvider>
                  <App />
                </QueueProvider>
              </BoardProvider>
              </ToastProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </FlagsProvider>
    </ErrorBoundary>
  </StrictMode>,
)
