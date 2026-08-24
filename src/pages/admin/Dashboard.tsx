import { useEffect, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Cake, CalendarClock, CheckCircle2, ClipboardList, Eye, Plus, Stethoscope, Users } from 'lucide-react'
import { usePatients } from '../../state/PatientsContext'
import { clinicalApi } from '../../lib/clinicalApi'

interface Stats {
  totalPatients: number
  dueForRecall: number
  upcomingBirthdays: number
  ongoingTreatments: number
  completedLastWeek: number
  awaitingTreatment: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const BIRTHDAY_WINDOW_DAYS = 30

/** "after 5 days" / "in 2 weeks" (case-insensitive) relative to when the
 * prescription was written — anything else in this free-text field (it's
 * not a real date picker) is left unparsed and just doesn't count towards
 * recall, rather than risk guessing wrong. */
const RECALL_PATTERN = /\b(?:after|in)\s+(\d+)\s*(day|days|week|weeks)\b/i

function recallDueDate(createdAt: string, nextVisit: string): Date | null {
  const match = nextVisit.match(RECALL_PATTERN)
  if (!match) return null
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  const amount = Number(match[1])
  const days = match[2].toLowerCase().startsWith('week') ? amount * 7 : amount
  const due = new Date(created)
  due.setDate(due.getDate() + days)
  return due
}

/** Days until this patient's next birthday (month/day only, year ignored),
 * or null if there's no full DOB on file (birth-year-only patients can't be
 * placed on a specific day). */
function daysUntilNextBirthday(dob: string, from: Date): number | null {
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let next = new Date(fromMidnight.getFullYear(), birth.getMonth(), birth.getDate())
  if (next.getTime() < fromMidnight.getTime()) {
    next = new Date(fromMidnight.getFullYear() + 1, birth.getMonth(), birth.getDate())
  }
  return Math.round((next.getTime() - fromMidnight.getTime()) / MS_PER_DAY)
}

export function Dashboard() {
  const { patients, loading: patientsLoading } = usePatients()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (patientsLoading) return
    let cancelled = false

    // No bulk "all consultations/treatments/prescriptions" endpoint exists —
    // fetch each patient's own records in parallel, same N+1 pattern
    // TreatmentsOverview already uses, and fold everything into clinic-wide counts.
    Promise.all(
      patients.map(async (patient) => {
        const [consultations, treatments, prescriptions] = await Promise.all([
          clinicalApi.listConsultations(patient.id),
          clinicalApi.listTreatments(patient.id),
          clinicalApi.listPrescriptionsForPatient(patient.id),
        ])
        return { patient, consultations, treatments, prescriptions }
      }),
    ).then((groups) => {
      if (cancelled) return

      const now = new Date()
      const weekAgo = now.getTime() - 7 * MS_PER_DAY
      let ongoingTreatments = 0
      let completedLastWeek = 0
      let awaitingTreatment = 0
      let dueForRecall = 0

      for (const { consultations, treatments, prescriptions } of groups) {
        for (const treatment of treatments) {
          if (treatment.status === 'ongoing') ongoingTreatments++
          if (treatment.status === 'finished' && treatment.completedAt && new Date(treatment.completedAt).getTime() >= weekAgo) {
            completedLastWeek++
          }
        }

        // Same rule the Treatments tab uses to decide whether a consultation
        // still needs a "Start treatment" prompt: a consultation is still
        // "awaiting treatment" if any service it recommended (or, absent any
        // recommendation, the consultation itself) has no treatment yet.
        const hasPendingTreatment = consultations.some((consultation) => {
          const startedServiceIds = new Set(
            treatments.filter((t) => t.consultationId === consultation.id).map((t) => t.serviceId),
          )
          if (consultation.recommendedServiceIds.length > 0) {
            return consultation.recommendedServiceIds.some((id) => !startedServiceIds.has(id))
          }
          return startedServiceIds.size === 0
        })
        if (hasPendingTreatment) awaitingTreatment++

        const isDueForRecall = prescriptions.some(
          (p) => p.nextVisit && (recallDueDate(p.createdAt, p.nextVisit)?.getTime() ?? Infinity) <= now.getTime(),
        )
        if (isDueForRecall) dueForRecall++
      }

      const upcomingBirthdays = patients.filter((patient) => {
        if (!patient.dob) return false
        const days = daysUntilNextBirthday(patient.dob, now)
        return days !== null && days <= BIRTHDAY_WINDOW_DAYS
      }).length

      setStats({
        totalPatients: patients.length,
        dueForRecall,
        upcomingBirthdays,
        ongoingTreatments,
        completedLastWeek,
        awaitingTreatment,
      })
    })

    return () => {
      cancelled = true
    }
  }, [patients, patientsLoading])

  const loading = patientsLoading || stats === null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1>Dashboard</h1>
        <p className="text-ink-soft">A quick snapshot of the clinic right now.</p>
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatWidget
            icon={Users}
            title="Patients"
            addTo="/admin/patients/new"
            rows={[
              { label: 'Total Patients', value: stats!.totalPatients, icon: Eye, to: '/admin/patients' },
              { label: 'Total Patient for Re-call', value: stats!.dueForRecall, icon: CalendarClock },
              { label: 'Upcoming Birthdays', value: stats!.upcomingBirthdays, icon: Cake },
            ]}
          />
          <StatWidget
            icon={Stethoscope}
            title="Treatments"
            rows={[
              { label: 'Ongoing Treatments', value: stats!.ongoingTreatments, icon: Stethoscope },
              { label: 'Completed Last Week', value: stats!.completedLastWeek, icon: CheckCircle2 },
              { label: 'Awaiting Treatment Start', value: stats!.awaitingTreatment, icon: ClipboardList },
            ]}
          />
        </div>
      )}
    </div>
  )
}

function StatWidget({
  icon: HeaderIcon,
  title,
  addTo,
  rows,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  addTo?: string
  rows: { label: string; value: number; icon: ComponentType<{ size?: number; className?: string }>; to?: string }[]
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink">
          <HeaderIcon size={18} className="text-accent-deep" />
          <span className="text-subheading font-medium">{title}</span>
        </div>
        {addTo && (
          <Link
            to={addTo}
            aria-label={`Add ${title.toLowerCase()}`}
            title={`Add ${title.toLowerCase()}`}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-tint text-accent-deep transition-colors hover:bg-accent hover:text-white"
          >
            <Plus size={16} />
          </Link>
        )}
      </div>

      <div className="flex flex-col divide-y divide-rule">
        {rows.map((row) => {
          const content = (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-heading font-bold text-accent-deep">{row.value}</span>
                <span className="text-body text-ink-soft">{row.label}</span>
              </div>
              <row.icon size={16} className="text-ink-faint" />
            </>
          )
          return row.to ? (
            <Link
              key={row.label}
              to={row.to}
              className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-accent-deep"
            >
              {content}
            </Link>
          ) : (
            <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
