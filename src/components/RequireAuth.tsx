import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { staff, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-ink-soft">Loading…</div>
  }

  if (!staff) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}