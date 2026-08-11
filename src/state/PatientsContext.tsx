import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { clinicalApi } from '../lib/clinicalApi'
import { useAuth } from './AuthContext'

export interface Patient {
  id: string
  patientNumber: number
  name: string
  phone: string
  address: string
  // Exactly one of these is set, depending on how the patient's birth info
  // was entered (full date of birth / age / birth year only).
  dob: string | null
  birthYear: number | null
  email: string
  weight: string
  medicalConditions: string[]
  medicalHistory: string
  registeredAt: string
}

type PatientDraft = Omit<Patient, 'id' | 'patientNumber' | 'registeredAt'>

interface PatientsContextValue {
  patients: Patient[]
  loading: boolean
  error: string | null
  addPatient: (patient: PatientDraft) => Promise<Patient>
  editPatient: (id: string, patient: PatientDraft) => Promise<Patient>
  refresh: () => Promise<void>
}

const PatientsContext = createContext<PatientsContextValue | null>(null)

function toApiPayload(patient: PatientDraft) {
  return {
    name: patient.name,
    phone: patient.phone,
    address: patient.address,
    dob: patient.dob ?? undefined,
    birth_year: patient.birthYear ?? undefined,
    email: patient.email || undefined,
    weight: patient.weight ? Number(patient.weight) : undefined,
    medical_conditions: patient.medicalConditions,
    medical_history: patient.medicalHistory || undefined,
  }
}

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

  async function addPatient(patient: PatientDraft) {
    const created = await clinicalApi.createPatient(toApiPayload(patient))
    setPatients((prev) => [created, ...prev])
    return created
  }

  async function editPatient(id: string, patient: PatientDraft) {
    const updated = await clinicalApi.updatePatient(id, toApiPayload(patient))
    setPatients((prev) => prev.map((p) => (p.id === id ? updated : p)))
    return updated
  }

  return (
    <PatientsContext.Provider value={{ patients, loading, error, addPatient, editPatient, refresh }}>
      {children}
    </PatientsContext.Provider>
  )
}

export function usePatients() {
  const ctx = useContext(PatientsContext)
  if (!ctx) throw new Error('usePatients must be used within PatientsProvider')
  return ctx
}