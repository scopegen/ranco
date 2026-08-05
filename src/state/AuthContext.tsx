import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { clearToken, getToken, setToken } from '../lib/api'
import type { Staff, StaffRole } from '../types/clinical'

interface RawStaff {
  id: string
  name: string
  role: StaffRole
  specialty: string | null
  email: string
}

interface LoginResponse {
  access_token: string
  staff: RawStaff
}

function toStaff(r: RawStaff): Staff {
  return { id: r.id, name: r.name, role: r.role, specialty: r.specialty, email: r.email }
}

interface AuthContextValue {
  staff: Staff | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get<RawStaff>('/auth/me')
      .then((r) => setStaff(toStaff(r)))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const res = await api.post<LoginResponse>('/auth/login', { email, password })
    setToken(res.access_token)
    setStaff(toStaff(res.staff))
  }

  function logout() {
    clearToken()
    setStaff(null)
  }

  return <AuthContext.Provider value={{ staff, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}