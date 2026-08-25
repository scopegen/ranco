import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, Calendar, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { usePatients } from '../../state/PatientsContext'
import { calculateAge } from '../../lib/age'
import { formatPatientId } from '../../lib/patientId'
import { formatDate } from '../../lib/date'

function toLocalISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toLocalISODate(d)
}

const DATE_PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => [daysAgo(0), daysAgo(0)] },
  { label: 'Yesterday', range: () => [daysAgo(1), daysAgo(1)] },
  { label: 'Last 7 days', range: () => [daysAgo(6), daysAgo(0)] },
  { label: 'Last 30 days', range: () => [daysAgo(29), daysAgo(0)] },
  {
    label: 'This month',
    range: () => {
      const now = new Date()
      return [toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)), daysAgo(0)]
    },
  },
]

export function PatientList() {
  const { patients, loading, error } = usePatients()
  const location = useLocation()
  const justAdded = (location.state as { justAdded?: string } | null)?.justAdded
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dateFilterOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setDateFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dateFilterOpen])

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qDigits = q.replace(/\s+/g, '')

    return patients.filter((patient) => {
      if (q) {
        const idMatch = formatPatientId(patient.patientNumber).toLowerCase().includes(q)
        const nameMatch = patient.name.toLowerCase().includes(q)
        const phoneMatch = patient.phone.replace(/\s+/g, '').includes(qDigits)
        if (!idMatch && !nameMatch && !phoneMatch) return false
      }

      // registeredAt is a full timestamp — compare by calendar date only, so
      // "to" is inclusive of that whole day rather than cutting off at 00:00.
      const registeredDate = patient.registeredAt.slice(0, 10)
      if (fromDate && registeredDate < fromDate) return false
      if (toDate && registeredDate > toDate) return false

      return true
    })
  }, [patients, query, fromDate, toDate])

  const dateFilterActive = fromDate || toDate

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1>Patients</h1>
          <p className="text-ink-soft">
            {loading
              ? 'Loading…'
              : query || dateFilterActive
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
          <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setDateFilterOpen((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2.5 text-body transition-colors sm:gap-2 sm:px-3.5 ${
                  dateFilterActive
                    ? 'border-accent bg-accent-tint text-accent-deep'
                    : 'border-rule bg-white text-ink-soft hover:text-ink'
                }`}
              >
                <Calendar size={16} className="shrink-0" />
                <span className="hidden sm:inline">
                  {dateFilterActive
                    ? fromDate === toDate
                      ? formatDate(fromDate)
                      : `${fromDate ? formatDate(fromDate) : 'Any'} – ${toDate ? formatDate(toDate) : 'Any'}`
                    : 'Filter by date'}
                </span>
                {dateFilterActive && (
                  <X
                    size={14}
                    className="ml-1 text-accent-deep hover:text-crit"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFromDate('')
                      setToDate('')
                    }}
                  />
                )}
              </button>

              {dateFilterOpen && (
                <div
                  ref={popoverRef}
                  className="absolute left-0 z-10 mt-2 flex w-[320px] max-w-[calc(100vw-3rem)] flex-col gap-4 rounded-xl border border-rule bg-white p-4 shadow-lg"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          const [from, to] = preset.range()
                          setFromDate(from)
                          setToDate(to)
                        }}
                        className="rounded-md border border-rule px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent-deep"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[12px] font-medium text-ink-faint">From</span>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        max={toDate || undefined}
                        className="rounded-lg border border-rule bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                      />
                    </label>
                    <span className="mt-5 text-ink-faint">→</span>
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[12px] font-medium text-ink-faint">To</span>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        min={fromDate || undefined}
                        className="rounded-lg border border-rule bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-rule pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setFromDate('')
                        setToDate('')
                      }}
                    >
                      Clear
                    </Button>
                    <Button type="button" onClick={() => setDateFilterOpen(false)}>
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, phone, or patient ID"
                aria-label="Search patients"
                className="w-full min-w-0 rounded-lg border border-rule bg-white py-2.5 pl-10 pr-3.5 text-body text-ink placeholder:text-ink-faint outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-rule bg-white shadow-sm">
            <table className="w-full text-left sm:min-w-[560px]">
              <thead>
                <tr className="border-b border-rule">
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Patient ID</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Name</th>
                  <th className="hidden px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:table-cell">Phone</th>
                  <th className="hidden px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:table-cell">Age</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => {
                  const age = calculateAge(patient.dob, patient.birthYear)
                  return (
                    <tr key={patient.id} className="border-b border-rule last:border-none">
                      <td className="px-4 py-3 font-mono text-[13px] text-ink-soft">{formatPatientId(patient.patientNumber)}</td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/patients/${formatPatientId(patient.patientNumber)}`} className="font-medium text-ink hover:text-accent-deep">
                          {patient.name}
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{patient.phone}</td>
                      <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{age === null ? '—' : `${age} yrs`}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link
                            to={`/admin/patients/${formatPatientId(patient.patientNumber)}/treatments`}
                            aria-label={`View treatments for ${patient.name}`}
                            title="View treatments"
                            className="rounded-md border border-accent px-2.5 py-1 text-[12px] font-medium text-accent-deep transition-colors hover:bg-accent-tint"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                      No patients match the current search/filter.
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