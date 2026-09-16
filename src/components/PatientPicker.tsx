import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { usePatients, type Patient } from '../state/PatientsContext'
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
    <div className="fixed inset-0 z-30">
      <div className="fixed inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[85vh] w-full max-w-md flex-col gap-4 rounded-t-2xl bg-paper p-6 shadow-[0_-8px_30px_-8px_rgba(16,24,38,0.35)] [animation:sheet-slide-up_0.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule pb-4">
          <h2 className="text-subheading font-medium text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="flex items-center justify-center rounded-full border border-rule bg-white p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
          >
            <X size={16} />
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
            filtered.map((patient) => (
              <button
                key={patient.id}
                type="button"
                onClick={() => onSelect(patient)}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-raised"
              >
                <span className="font-medium text-ink">{patient.name}</span>
                <span className="font-mono text-[12px] text-ink-faint">{formatPatientId(patient.patientNumber)}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
