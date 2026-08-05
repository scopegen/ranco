import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { clinicalApi } from '../lib/clinicalApi'
import { useAuth } from './AuthContext'

export interface Patient {
  id: string
  patientNumber: number
  name: string
  phone: string
  address: string
  dob: string
  email: string
  weight: string
  medicalConditions: string[]
  medicalHistory: string
  registeredAt: string
}

interface PatientsContextValue {
  patients: Patient[]
  loading: boolean
  error: string | null
  addPatient: (patient: Omit<Patient, 'id' | 'patientNumber' | 'registeredAt'>) => Promise<Patient>
  refresh: () => Promise<void>
}

const PatientsContext = createContext<PatientsContextValue | null>(null)

export function PatientsProvider({ children }: { children: ReactNode }) {
  const { staff } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPatients(await clinicalApi.listPatients())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (staff) refresh()
  }, [staff, refresh])

  async function addPatient(patient: Omit<Patient, 'id' | 'patientNumber' | 'registeredAt'>) {
    const created = await clinicalApi.createPatient({
      name: patient.name,
      phone: patient.phone,
      address: patient.address,
      dob: patient.dob,
      email: patient.email || undefined,
      weight: patient.weight ? Number(patient.weight) : undefined,
      medical_conditions: patient.medicalConditions,
      medical_history: patient.medicalHistory || undefined,
    })
    setPatients((prev) => [created, ...prev])
    return created
  }

  return (
    <PatientsContext.Provider value={{ patients, loading, error, addPatient, refresh }}>
      {children}
    </PatientsContext.Provider>
  )
}

export function usePatients() {
  const ctx = useContext(PatientsContext)
  if (!ctx) throw new Error('usePatients must be used within PatientsProvider')
  return ctx
}