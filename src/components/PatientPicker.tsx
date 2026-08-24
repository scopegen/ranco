import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { usePatients, type Patient } from '../state/PatientsContext'
import { calculateAge } from '../lib/age'
import { formatPatientId } from '../lib/patientId'

/** Modal patient search+pick, shared by any quick-action that needs "do X
 * for which patient" before it can continue (e.g. Add Payment, Add
 * Consultation from the dashboard's quick-add menu). Search logic mirrors
 * the Patients list page (name / phone / patient ID). */
export function PatientPicker({
  title,
  onSelect,
  onClose,
}: {
  title: string
  onSelect: (patient: Patient) => void
  onClose: () => void
}) {
  const { patients, loading } = usePatients()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return patients
    const qDigits = q.replace(/\s+/g, '')
    return patients.filter((patient) => {
      const idMatch = formatPatientId(patient.patientNumber).toLowerCase().includes(q)
      const nameMatch = patient.name.toLowerCase().includes(q)
      const phoneMatch = patient.phone.replace(/\s+/g, '').includes(qDigits)
      return idMatch || nameMatch || phoneMatch
    })
  }, [patients, query])

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-ink/40 px-4 pt-20 sm:pt-28" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col gap-4 rounded-xl border border-rule bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-subheading font-medium text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-full p-1.5 text-ink-soft transition-colors hover:bg-paper-raised hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative shrink-0">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, or patient ID"
            aria-label="Search patients"
            className="w-full min-w-0 rounded-lg border border-rule bg-white py-2.5 pl-10 pr-3.5 text-body text-ink placeholder:text-ink-faint outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint"
          />
        </div>

        <div className="flex flex-col overflow-y-auto">
          {loading && <p className="py-4 text-center text-body text-ink-soft">Loading…</p>}
          {!loading && filtered.length === 0 && <p className="py-4 text-center text-body text-ink-soft">No patients found.</p>}
          {!loading &&
            filtered.map((patient) => {
              const age = calculateAge(patient.dob, patient.birthYear)
              return (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => onSelect(patient)}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-raised"
                >
                  <span className="font-medium text-ink">{patient.name}</span>
                  <span className="text-[12px] text-ink-faint">
                    <span className="font-mono">{formatPatientId(patient.patientNumber)}</span>
                    {age !== null && ` · ${age} yrs`} · {patient.phone}
                  </span>
                </button>
              )
            })}
        </div>
      </div>
    </div>
  )
}
