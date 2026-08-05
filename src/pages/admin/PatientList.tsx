import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Button } from '../../components/Button'
import { usePatients } from '../../state/PatientsContext'
import { calculateAge } from '../../lib/age'
import { formatPatientId } from '../../lib/patientId'
import { formatDate } from '../../lib/date'

export function PatientList() {
  const { patients, loading, error } = usePatients()
  const location = useLocation()
  const justAdded = (location.state as { justAdded?: string } | null)?.justAdded
  const [query, setQuery] = useState('')

  const filteredPatients = useMemo(() => {
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
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1>Patients</h1>
          <p className="text-ink-soft">
            {loading
              ? 'Loading…'
              : query
                ? `${filteredPatients.length} of ${patients.length} registered`
                : `${patients.length} registered`}
          </p>
        </div>
        <Link to="/admin/patients/new">
          <Button>+ New patient</Button>
        </Link>
      </div>

      {justAdded && (
        <div className="rounded-lg border border-rule bg-accent-tint px-4 py-3 text-body text-accent-deep">
          <span className="font-medium">{justAdded}</span> added to the system.
        </div>
      )}

      {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}

      {!loading && !error && (
        <>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, phone, or patient ID"
              aria-label="Search patients"
              className="w-full rounded-lg border border-rule bg-white py-2.5 pl-10 pr-3.5 text-body text-ink placeholder:text-ink-faint outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-rule bg-white shadow-sm">
            <table className="w-full text-left sm:min-w-[560px]">
              <thead>
                <tr className="border-b border-rule">
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Patient ID</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Name</th>
                  <th className="hidden px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:table-cell">Phone</th>
                  <th className="hidden px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:table-cell">Age</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Registered</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => {
                  const age = calculateAge(patient.dob)
                  return (
                    <tr key={patient.id} className="border-b border-rule last:border-none">
                      <td className="px-4 py-3 font-mono text-[13px] text-ink-soft">{formatPatientId(patient.patientNumber)}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/patients/${patient.id}`}
                          className="font-medium text-ink hover:text-accent-deep"
                        >
                          {patient.name}
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{patient.phone}</td>
                      <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{age === null ? '—' : `${age} yrs`}</td>
                      <td className="px-4 py-3 text-ink-soft">{formatDate(patient.registeredAt)}</td>
                    </tr>
                  )
                })}
                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                      No patients match "{query}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}