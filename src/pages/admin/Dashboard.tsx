import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Cake, CalendarClock, IndianRupee, Stethoscope, Users, Wallet, X } from 'lucide-react'
import { usePatients } from '../../state/PatientsContext'
import { useAuth } from '../../state/AuthContext'
import { useClinic } from '../../state/ClinicContext'
import { clinicalApi } from '../../lib/clinicalApi'
import { formatPatientId } from '../../lib/patientId'
import { formatDate } from '../../lib/date'
import { formatINR } from '../../lib/currency'

interface DayCount {
  date: string
  label: string
  count: number
}

interface ServiceCount {
  name: string
  count: number
}

/** One row in a stat card's "list which is represented" popup — generic
 * enough to cover treatments, patients, whatever the stat is counting. */
interface ListItem {
  id: string
  to: string
  primary: string
  secondary: string
}

type StatKey = 'ongoing' | 'recall' | 'birthdays' | 'due' | 'paidToday'

interface DashboardData {
  totalPatients: number
  patientsPerDay: DayCount[]
  servicesOpted: ServiceCount[]
  lists: Record<StatKey, ListItem[]>
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

/** Same calendar day in the viewer's own timezone — paidAt comes back as a
 * tz-aware instant, so this is not the same as comparing raw date strings. */
function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
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

const STAT_LIST_META: Record<StatKey, { title: string; empty: string }> = {
  ongoing: { title: 'Ongoing Treatments', empty: 'No ongoing treatments.' },
  recall: { title: 'Due for Re-call', empty: 'No one due for recall right now.' },
  birthdays: { title: 'Upcoming Birthdays', empty: 'No birthdays in the next 30 days.' },
  due: { title: 'Payment Dues', empty: 'No one has an outstanding balance.' },
  paidToday: { title: "Payments Today", empty: 'No payments recorded today.' },
}

export function Dashboard() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'admin'
  const { patients, loading: patientsLoading } = usePatients()
  const { serviceName } = useClinic()
  const [data, setData] = useState<DashboardData | null>(null)
  const [openList, setOpenList] = useState<StatKey | null>(null)

  useEffect(() => {
    if (patientsLoading) return
    let cancelled = false

    // No bulk "all consultations/treatments/prescriptions" endpoint exists —
    // fetch each patient's own records in parallel, same N+1 pattern
    // TreatmentsOverview already uses, and fold everything into clinic-wide counts.
    // Billing is admin-only (enforced server-side too) — doctors skip those
    // two calls entirely rather than eating a 403 on every patient.
    Promise.all(
      patients.map(async (patient) => {
        const [consultations, treatments, prescriptions, billingSummary, payments] = await Promise.all([
          clinicalApi.listConsultations(patient.id),
          clinicalApi.listTreatments(patient.id),
          clinicalApi.listPrescriptionsForPatient(patient.id),
          isAdmin ? clinicalApi.getBillingSummary(patient.id) : Promise.resolve(null),
          isAdmin ? clinicalApi.listPatientPayments(patient.id) : Promise.resolve([]),
        ])
        return { patient, consultations, treatments, prescriptions, billingSummary, payments }
      }),
    ).then((groups) => {
      if (cancelled) return

      const now = new Date()

      const countsByDate: Record<string, number> = {}
      const countsByService: Record<string, number> = {}
      const lists: Record<StatKey, ListItem[]> = {
        ongoing: [],
        recall: [],
        birthdays: [],
        due: [],
        paidToday: [],
      }
      // Sorted separately below (most owed / most recent first) rather than
      // in patient-fetch order.
      const dueRows: { id: string; to: string; primary: string; outstanding: number }[] = []
      const paidTodayRows: { id: string; to: string; primary: string; amount: number; mode: string; paidAt: string }[] = []

      for (const { patient, consultations, treatments, prescriptions, billingSummary, payments } of groups) {
        const code = formatPatientId(patient.patientNumber)

        if (billingSummary && billingSummary.totalOutstanding > 0) {
          dueRows.push({
            id: patient.id,
            to: `/admin/patients/${code}/billing`,
            primary: patient.name,
            outstanding: billingSummary.totalOutstanding,
          })
        }
        for (const payment of payments) {
          if (isSameLocalDay(new Date(payment.paidAt), now)) {
            paidTodayRows.push({
              id: payment.id,
              to: `/admin/patients/${code}/billing`,
              primary: patient.name,
              amount: payment.amount,
              mode: payment.paymentMode,
              paidAt: payment.paidAt,
            })
          }
        }

        for (const treatment of treatments) {
          countsByService[treatment.serviceId] = (countsByService[treatment.serviceId] ?? 0) + 1

          if (treatment.status === 'ongoing') {
            lists.ongoing.push({
              id: treatment.id,
              to: `/admin/patients/${code}/treatments`,
              primary: patient.name,
              secondary: `${serviceName(treatment.serviceId)} · started ${formatDate(treatment.startedAt)}`,
            })
          }
        }

        for (const consultation of consultations) {
          countsByDate[consultation.consultDate] = (countsByDate[consultation.consultDate] ?? 0) + 1
        }

        const isDueForRecall = prescriptions.some(
          (p) => p.nextVisit && (recallDueDate(p.createdAt, p.nextVisit)?.getTime() ?? Infinity) <= now.getTime(),
        )
        if (isDueForRecall) {
          lists.recall.push({
            id: patient.id,
            to: `/admin/patients/${code}`,
            primary: patient.name,
            secondary: patient.phone,
          })
        }
      }

      const upcomingBirthdays: { patient: (typeof patients)[number]; days: number }[] = []
      for (const patient of patients) {
        if (!patient.dob) continue
        const days = daysUntilNextBirthday(patient.dob, now)
        if (days === null || days > BIRTHDAY_WINDOW_DAYS) continue
        upcomingBirthdays.push({ patient, days })
      }
      upcomingBirthdays.sort((a, b) => a.days - b.days)
      lists.birthdays = upcomingBirthdays.map(({ patient, days }) => ({
        id: patient.id,
        to: `/admin/patients/${formatPatientId(patient.patientNumber)}`,
        primary: patient.name,
        secondary: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`,
      }))

      dueRows.sort((a, b) => b.outstanding - a.outstanding) // most owed first
      lists.due = dueRows.map((row) => ({ id: row.id, to: row.to, primary: row.primary, secondary: formatINR(row.outstanding) }))

      paidTodayRows.sort((a, b) => b.paidAt.localeCompare(a.paidAt)) // most recent first
      lists.paidToday = paidTodayRows.map((row) => ({
        id: row.id,
        to: row.to,
        primary: row.primary,
        secondary: `${formatINR(row.amount)} · ${row.mode.toUpperCase()}`,
      }))

      // Last 7 days (today included), oldest first — how many patients were
      // seen (had a consultation logged) each day.
      const patientsPerDay: DayCount[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        const date = isoDate(d)
        return { date, label: d.toLocaleDateString('en-IN', { weekday: 'short' }), count: countsByDate[date] ?? 0 }
      })

      // All-time, how many times each service has been opted into (a
      // treatment started for it) — sorted most to least popular.
      const servicesOpted = Object.entries(countsByService)
        .map(([serviceId, count]) => ({ name: serviceName(serviceId), count }))
        .sort((a, b) => b.count - a.count)

      setData({ totalPatients: patients.length, patientsPerDay, servicesOpted, lists })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serviceName is stable enough in practice (services list rarely changes mid-session); including it would refire this fairly expensive fetch on every ClinicContext refresh.
  }, [patients, patientsLoading])

  const loading = patientsLoading || data === null
  const firstName = staff?.name?.split(' ')[0]

  

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1>Hello{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-ink-soft">A quick snapshot of the clinic right now.</p>
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <PastelStat colorIndex={0} icon={Users} value={data!.totalPatients} label="Total Patients" to="/admin/patients" />
            <PastelStat
              colorIndex={1}
              icon={Stethoscope}
              value={data!.lists.ongoing.length}
              label="Ongoing Treatments"
              onClick={() => setOpenList('ongoing')}
            />
            <PastelStat
              colorIndex={2}
              icon={CalendarClock}
              value={data!.lists.recall.length}
              label="Due for Re-call"
              onClick={() => setOpenList('recall')}
            />
            <PastelStat
              colorIndex={3}
              icon={Cake}
              value={data!.lists.birthdays.length}
              label="Upcoming Birthdays"
              onClick={() => setOpenList('birthdays')}
            />
            {/* Billing is admin-only everywhere else in the app — same rule here. */}
            {isAdmin && (
              <>
                <PastelStat
                  colorIndex={2}
                  icon={Wallet}
                  value={data!.lists.due.length}
                  label="Payment Dues"
                  onClick={() => setOpenList('due')}
                />
                <PastelStat
                  colorIndex={3}
                  icon={IndianRupee}
                  value={data!.lists.paidToday.length}
                  label="Payments Today"
                  onClick={() => setOpenList('paidToday')}
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <DashboardCard title="Patients seen — last 7 days" className="lg:col-span-3">
              <PatientsPerDayChart data={data!.patientsPerDay} />
            </DashboardCard>
            <DashboardCard title="Services opted" className="lg:col-span-2">
              <ServicesOptedChart data={data!.servicesOpted} />
            </DashboardCard>
          </div>

          {openList && (
            <StatListModal
              title={STAT_LIST_META[openList].title}
              emptyMessage={STAT_LIST_META[openList].empty}
              items={data!.lists[openList]}
              onClose={() => setOpenList(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

function StatListModal({
  title,
  emptyMessage,
  items,
  onClose,
}: {
  title: string
  emptyMessage: string
  items: ListItem[]
  onClose: () => void
}) {
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

        <div className="flex flex-col gap-1 overflow-y-auto">
          {items.length === 0 && <p className="py-4 text-center text-body text-ink-soft">{emptyMessage}</p>}
          {items.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              onClick={onClose}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-raised"
            >
              <span className="font-medium text-ink">{item.primary}</span>
              <span className="text-right text-[12px] text-ink-faint">{item.secondary}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function DashboardCard({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
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
  onClick,
}: {
  colorIndex: number
  icon: ComponentType<{ size?: number; className?: string }>
  value: number
  label: string
  to?: string
  onClick?: () => void
}) {
  const { bg, fg } = PASTELS[colorIndex % PASTELS.length]
  const content = (
    <div
      className="flex h-full flex-col justify-between gap-4 rounded-2xl p-4 text-left shadow-[0_4px_20px_-8px_rgba(30,40,70,0.1)] transition-transform duration-150 hover:-translate-y-0.5"
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
  if (to) return <Link to={to}>{content}</Link>
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full">
        {content}
      </button>
    )
  }
  return content
}
