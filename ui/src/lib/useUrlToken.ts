import { useEffect, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'

/**
 * Reads the emailed `?token=` once and strips it from the address bar, so it does not linger in
 * history or get captured with the page URL (e.g. by Sentry).
 */
export function useUrlToken(): string {
  const [params] = useSearchParams()
  const [token] = useState(() => params.get('token') ?? '')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    navigate(pathname, { replace: true })
  }, [navigate, pathname])
  return token
}
