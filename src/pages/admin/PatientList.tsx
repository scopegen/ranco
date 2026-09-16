import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, Calendar, PhoneCall, Stethoscope, UserPlus, Users, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { usePatients } from '../../state/PatientsContext'
import { clinicalApi } from '../../lib/clinicalApi'
import { calculateAge } from '../../lib/age'
import { formatPatientId } from '../../lib/patientId'
import { formatDate } from '../../lib/date'

// Same "due soon" window as the Dashboard's own stat tile — overdue counts
// too, not just the next 7 days ahead.
const DUE_SOON_WINDOW_DAYS = 7

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
  const navigate = useNavigate()
  const justAdded = (location.state as { justAdded?: string } | null)?.justAdded
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [dueSoonPatientIds, setDueSoonPatientIds] = useState<Set<string>>(new Set())
  const [ongoingTreatments, setOngoingTreatments] = useState(0)

  // No bulk "all next-calls"/"all treatments" endpoint exists — fetch each
  // patient's own records in parallel, same N+1 pattern the
  // Dashboard/TreatmentsOverview already use: which patients have a call
  // due soon, plus (for the stat tiles above the table) how many treatments
  // clinic-wide are currently ongoing.
  useEffect(() => {
    if (loading) return
    let cancelled = false
    const cutoff = new Date(Date.now() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000).getTime()

    Promise.all(
      patients.map(async (patient) => {
        const [nextCalls, treatments] = await Promise.all([
          clinicalApi.listNextCalls(patient.id),
          clinicalApi.listTreatments(patient.id),
        ])
        const dueSoon = nextCalls.some((nc) => nc.status === 'upcoming' && new Date(nc.scheduledAt).getTime() <= cutoff)
        const ongoing = treatments.filter((t) => t.status === 'ongoing').length
        return { patientId: dueSoon ? patient.id : null, ongoing }
      }),
    ).then((results) => {
      if (cancelled) return
      setDueSoonPatientIds(new Set(results.map((r) => r.patientId).filter((id): id is string => id !== null)))
      setOngoingTreatments(results.reduce((sum, r) => sum + r.ongoing, 0))
    })

    return () => {
      cancelled = true
    }
  }, [patients, loading])

  const newThisMonth = useMemo(() => {
    const now = new Date()
    return patients.filter((p) => {
      const registered = new Date(p.registeredAt)
      return registered.getFullYear() === now.getFullYear() && registered.getMonth() === now.getMonth()
    }).length
  }, [patients])

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
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
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

      {!loading && !error && (
        // Horizontal scroll on mobile (four fixed-width tiles in one row,
        // not a 2x2 wrap) — sm and up switches to a normal 4-col grid since
        // there's room for it. Scrollbar hidden (still scrolls via touch/
        // trackpad, just no visible track) — the [&::-webkit-scrollbar]
        // part covers Chrome/Safari, the two properties cover Firefox/IE.
        <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
          <StatTile colorIndex={0} icon={Users} value={patients.length} label="Total Patients" />
          <StatTile colorIndex={1} icon={UserPlus} value={newThisMonth} label="New This Month" />
          <StatTile colorIndex={2} icon={Stethoscope} value={ongoingTreatments} label="Ongoing Treatments" />
          <StatTile colorIndex={3} icon={PhoneCall} value={dueSoonPatientIds.size} label="Due for Call" />
        </div>
      )}

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
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft">Patient ID</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft">Name</th>
                  <th className="hidden px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft sm:table-cell">Phone</th>
                  <th className="hidden px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft sm:table-cell">Age</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => {
                  const age = calculateAge(patient.dob, patient.birthYear)
                  const overviewPath = `/admin/patients/${formatPatientId(patient.patientNumber)}`
                  return (
                    <tr
                      key={patient.id}
                      onClick={() => navigate(overviewPath)}
                      className="cursor-pointer border-b border-rule transition-colors last:border-none hover:bg-accent-tint/40"
                    >
                      <td className="px-4 py-3 font-mono text-[13px] text-ink-soft">
                        {/* Mobile only — just the number, no "RANCO-" prefix, to save width; desktop keeps the full ID. Display-only, the full formatPatientId is still what's used for the actual URL/search everywhere else. */}
                        <span className="hidden sm:inline">{formatPatientId(patient.patientNumber)}</span>
                        <span className="sm:hidden">{String(patient.patientNumber).padStart(4, '0')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={overviewPath}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-ink hover:text-accent-deep"
                        >
                          {patient.name}
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{patient.phone}</td>
                      <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{age === null ? '—' : `${age} yrs`}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* Same View button, same destination (the patient's
                              overview) — when a call is due soon, it just
                              turns red with a phone icon instead of adding a
                              second button next to it. */}
                          <Link
                            to={overviewPath}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={dueSoonPatientIds.has(patient.id) ? `View ${patient.name} — call due soon` : `View ${patient.name}`}
                            title={dueSoonPatientIds.has(patient.id) ? 'Call due soon' : 'View'}
                            className={`flex w-16 items-center justify-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                              dueSoonPatientIds.has(patient.id)
                                ? 'border-crit bg-crit-soft text-crit hover:bg-crit hover:text-white'
                                : 'border-transparent bg-[#E1F1FC] text-[#2F8FE0] hover:bg-[#2F8FE0] hover:text-white'
                            }`}
                          >
                            {dueSoonPatientIds.has(patient.id) && <PhoneCall size={12} />}
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

// Own copy of a Dashboard-style pastel set (each page keeps its own — see
// Dashboard.tsx's PASTELS) so the two can evolve independently; picked to
// match the reference screenshot's per-tile colors.
const STAT_COLORS = [
  { bg: '#E1F1FC', fg: '#2F8FE0' }, // sky blue — Total Patients
  { bg: '#E2F7EC', fg: '#1FAE72' }, // mint — New This Month
  { bg: '#EDEBFB', fg: '#6C5CE7' }, // lavender — Ongoing Treatments
  { bg: '#DFF6F5', fg: '#0E8C88' }, // teal (ties to the logo's own teal) — Due for Call
]

function StatTile({
  colorIndex,
  icon: Icon,
  value,
  label,
}: {
  colorIndex: number
  icon: ComponentType<{ size?: number; className?: string }>
  value: number
  label: string
}) {
  const { bg, fg } = STAT_COLORS[colorIndex % STAT_COLORS.length]
  return (
    <div
      className="flex min-w-[130px] shrink-0 flex-col justify-between gap-2 rounded-xl p-3 shadow-sm sm:min-w-0 sm:shrink sm:flex-row sm:items-center sm:justify-start sm:gap-3 sm:p-4"
      style={{ backgroundColor: bg }}
    >
      {/* Mobile: label above, icon+number below — narrower per tile than the
          icon-beside-text desktop layout, so all four fit in one row. */}
      <p className="text-[12px] font-medium text-ink-soft sm:hidden">{label}</p>
      <div className="flex items-center gap-2 sm:hidden">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70" style={{ color: fg }}>
          <Icon size={16} />
        </span>
        <p className="text-heading font-bold" style={{ color: fg }}>
          {value}
        </p>
      </div>

      {/* Desktop: icon left, value+label stacked to the right. */}
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/70 sm:flex" style={{ color: fg }}>
        <Icon size={18} />
      </span>
      <div className="hidden sm:block">
        <p className="text-heading font-bold" style={{ color: fg }}>
          {value}
        </p>
        <p className="text-[13px] font-medium text-ink-soft">{label}</p>
      </div>
    </div>
  )
}