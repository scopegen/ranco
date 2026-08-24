import { useState, type SubmitEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { useAuth } from '../state/AuthContext'
import { ApiError } from '../lib/api'

export function Login() {
  const { staff, loading, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already signed in and landing on / directly (e.g. a stale tab, or
  // browser autofill of the root URL) — go straight to the dashboard
  // instead of showing the form again.
  if (!loading && staff) {
    return <Navigate to="/admin" replace />
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/admin')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-rule bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3 pb-1">
          <img src="/images/Ranco-logo-new.webp" alt="Ranco Dental Clinic" className="h-9 w-auto" />
          <h1 className="text-subheading font-medium">Staff sign in</h1>
        </div>

        {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}

        <Field label="Email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@rancodental.com" autoFocus />
        <Field label="Password" required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}