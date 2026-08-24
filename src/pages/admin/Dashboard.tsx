import { useEffect, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Cake, CalendarClock, CheckCircle2, ClipboardList, Stethoscope, Users } from 'lucide-react'
import { usePatients } from '../../state/PatientsContext'
import { useAuth } from '../../state/AuthContext'
import { useClinic } from '../../state/ClinicContext'
import { clinicalApi } from '../../lib/clinicalApi'

interface Stats {
  totalPatients: number
  dueForRecall: number
  upcomingBirthdays: number
  ongoingTreatments: number
  completedLastWeek: number
  awaitingTreatment: number
}

interface DayCount {
  date: string
  label: string
  count: number
}

interface ServiceCount {
  name: string
  count: number
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

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

// Dashboard-only palette — kept local to this file on purpose (see the
// color-scope decision): the rest of the app stays on the blue accent
// theme in index.css, this page alone gets the softer multi-color look.
const PASTELS = [
  { bg: '#EDEBFB', fg: '#6C5CE7' }, // lavender
  { bg: '#E1F1FC', fg: '#2F8FE0' }, // sky blue
  { bg: '#FBE7F0', fg: '#E15B96' }, // pink
  { bg: '#E2F7EC', fg: '#1FAE72' }, // mint
]

export function Dashboard() {
  const { staff } = useAuth()
  const { patients, loading: patientsLoading } = usePatients()
  const { serviceName } = useClinic()
  const [stats, setStats] = useState<Stats | null>(null)
  const [patientsPerDay, setPatientsPerDay] = useState<DayCount[] | null>(null)
  const [servicesOpted, setServicesOpted] = useState<ServiceCount[] | null>(null)

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

      const countsByDate: Record<string, number> = {}
      const countsByService: Record<string, number> = {}

      for (const { consultations, treatments, prescriptions } of groups) {
        for (const treatment of treatments) {
          if (treatment.status === 'ongoing') ongoingTreatments++
          if (treatment.status === 'finished' && treatment.completedAt && new Date(treatment.completedAt).getTime() >= weekAgo) {
            completedLastWeek++
          }
          countsByService[treatment.serviceId] = (countsByService[treatment.serviceId] ?? 0) + 1
        }

        for (const consultation of consultations) {
          countsByDate[consultation.consultDate] = (countsByDate[consultation.consultDate] ?? 0) + 1
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

      // Last 7 days (today included), oldest first — how many patients were
      // seen (had a consultation logged) each day.
      const days: DayCount[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        const date = isoDate(d)
        return { date, label: d.toLocaleDateString('en-IN', { weekday: 'short' }), count: countsByDate[date] ?? 0 }
      })
      setPatientsPerDay(days)

      // All-time, how many times each service has been opted into (a
      // treatment started for it) — sorted most to least popular.
      const services = Object.entries(countsByService)
        .map(([serviceId, count]) => ({ name: serviceName(serviceId), count }))
        .sort((a, b) => b.count - a.count)
      setServicesOpted(services)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serviceName is stable enough in practice (services list rarely changes mid-session); including it would refire this fairly expensive fetch on every ClinicContext refresh.
  }, [patients, patientsLoading])

  const loading = patientsLoading || stats === null || patientsPerDay === null || servicesOpted === null
  const firstName = staff?.name?.split(' ')[0]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1>Hello{firstName ? `, ${firstName}` : ''} 👋</h1>
        <p className="text-ink-soft">A quick snapshot of the clinic right now.</p>
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <PastelStat colorIndex={0} icon={Users} value={stats!.totalPatients} label="Total Patients" to="/admin/patients" />
            <PastelStat colorIndex={1} icon={Stethoscope} value={stats!.ongoingTreatments} label="Ongoing Treatments" />
            <PastelStat colorIndex={2} icon={CalendarClock} value={stats!.dueForRecall} label="Due for Re-call" />
            <PastelStat colorIndex={3} icon={Cake} value={stats!.upcomingBirthdays} label="Upcoming Birthdays" />
            <PastelStat colorIndex={0} icon={CheckCircle2} value={stats!.completedLastWeek} label="Completed Last Week" />
            <PastelStat colorIndex={1} icon={ClipboardList} value={stats!.awaitingTreatment} label="Awaiting Treatment" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <DashboardCard title="Patients seen — last 7 days" className="lg:col-span-3">
              <PatientsPerDayChart data={patientsPerDay!} />
            </DashboardCard>
            <DashboardCard title="Services opted" className="lg:col-span-2">
              <ServicesOptedChart data={servicesOpted!} />
            </DashboardCard>
          </div>
        </>
      )}
    </div>
  )
}

function DashboardCard({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_4px_24px_-8px_rgba(30,40,70,0.12)] ${className}`}>
      <p className="text-subheading font-medium text-ink">{title}</p>
      {children}
    </div>
  )
}

function PatientsPerDayChart({ data }: { data: DayCount[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  if (total === 0) {
    return <p className="py-10 text-center text-body text-ink-soft">No patients seen in the last 7 days.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="patientsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2F8FE0" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2F8FE0" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8894a3' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#8894a3' }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #e1e7ef', fontSize: 13 }}
          labelFormatter={(label, payload) => payload?.[0]?.payload?.date ?? label}
          formatter={(value) => [`${value} patient${value === 1 ? '' : 's'}`, '']}
        />
        <Area type="monotone" dataKey="count" stroke="#2F8FE0" strokeWidth={2.5} fill="url(#patientsFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function ServicesOptedChart({ data }: { data: ServiceCount[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-body text-ink-soft">No treatments logged yet.</p>
  }
  const top = data.slice(0, 8)
  const height = Math.max(160, top.length * 34)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#8894a3' }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: '#101826' }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          cursor={{ fill: '#f3f6fa' }}
          contentStyle={{ borderRadius: 12, border: '1px solid #e1e7ef', fontSize: 13 }}
          formatter={(value) => [`${value} opted`, '']}
        />
        <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={16}>
          {top.map((entry, i) => (
            <Cell key={entry.name} fill={PASTELS[i % PASTELS.length].fg} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function PastelStat({
  colorIndex,
  icon: Icon,
  value,
  label,
  to,
}: {
  colorIndex: number
  icon: ComponentType<{ size?: number; className?: string }>
  value: number
  label: string
  to?: string
}) {
  const { bg, fg } = PASTELS[colorIndex % PASTELS.length]
  const content = (
    <div
      className="flex h-full flex-col justify-between gap-4 rounded-2xl p-4 shadow-[0_4px_20px_-8px_rgba(30,40,70,0.1)] transition-transform duration-150 hover:-translate-y-0.5"
      style={{ backgroundColor: bg }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70" style={{ color: fg }}>
        <Icon size={18} />
      </span>
      <div>
        <p className="text-heading font-bold" style={{ color: fg }}>
          {value}
        </p>
        <p className="text-[13px] font-medium text-ink-soft">{label}</p>
      </div>
    </div>
  )
  return to ? <Link to={to}>{content}</Link> : content
}
