import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Calendar, CreditCard, PhoneCall, Search, Stethoscope, UserPlus, Users, Wallet, X } from 'lucide-react'
import { usePatients, type Patient } from '../../state/PatientsContext'
import { useAuth } from '../../state/AuthContext'
import { useClinic } from '../../state/ClinicContext'
import { clinicalApi } from '../../lib/clinicalApi'
import { formatPatientId } from '../../lib/patientId'
import { formatDate, formatDateTime } from '../../lib/date'
import { formatINR } from '../../lib/currency'
import { Button } from '../../components/Button'
import { PatientPicker } from '../../components/PatientPicker'
import type { Consultation, Treatment } from '../../types/clinical'

interface DayCount {
  date: string
  label: string
  count: number
}

interface DayAmount {
  date: string
  label: string
  amount: number
}

interface ServiceCount {
  name: string
  count: number
}

/** {name, value} — shared shape for all three pie charts below. */
interface PieDatum {
  name: string
  value: number
}

/** One row in a stat card's "list which is represented" popup — generic
 * enough to cover treatments, patients, whatever the stat is counting. */
interface ListItem {
  id: string
  to: string
  primary: string
  secondary: string
}

type StatKey = 'ongoing' | 'due' | 'dueSoonCalls'

interface DashboardData {
  totalPatients: number
  patientsPerDay: DayCount[]
  servicesOpted: ServiceCount[]
  // Admin-only (billing data) — empty for doctors, who never see these
  // three pie charts at all (see the isAdmin check around them).
  revenueByService: PieDatum[]
  paymentModeSplit: PieDatum[]
  billingBreakdown: PieDatum[]
  // Admin-only too — replaced the old "Payments Today" stat tile with a
  // proper 7-day trend instead of just a same-day count.
  paymentsByDay: DayAmount[]
  lists: Record<StatKey, ListItem[]>
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
// "Due soon" for the Next Call stat — overdue (already past) counts too,
// not just the next 7 days ahead; only the far future is excluded.
const DUE_SOON_WINDOW_DAYS = 7

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Same calendar day in the viewer's own timezone — paidAt comes back as a
 * tz-aware instant, so this is not the same as comparing raw date strings. */
function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Plain string comparison on the first 10 chars ("YYYY-MM-DD") — works for
 * both a bare date (consultDate) and a full timestamp (startedAt, paidAt)
 * without the timezone footguns of parsing into a Date first; ISO dates
 * sort correctly as strings. Same approach PatientList.tsx's own date
 * filter already uses (`registeredAt.slice(0, 10)`). */
function inRange(dateStr: string | null | undefined, from: string, to: string): boolean {
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  return d >= from && d <= to
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDate(d)
}

// Same preset-picker pattern PatientList.tsx's own date filter already
// uses, extended with the two this page specifically asked for (Last 21
// days, Last month) that PatientList doesn't have.
const DATE_PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => [daysAgo(0), daysAgo(0)] },
  { label: 'Yesterday', range: () => [daysAgo(1), daysAgo(1)] },
  { label: 'Last 7 days', range: () => [daysAgo(6), daysAgo(0)] },
  { label: 'Last 21 days', range: () => [daysAgo(20), daysAgo(0)] },
  {
    label: 'This month',
    range: () => {
      const now = new Date()
      return [isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), daysAgo(0)]
    },
  },
  {
    label: 'Last month',
    range: () => {
      const now = new Date()
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastOfLastMonth = new Date(firstOfThisMonth.getTime() - MS_PER_DAY)
      const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1)
      return [isoDate(firstOfLastMonth), isoDate(lastOfLastMonth)]
    },
  },
]

/** Every calendar day from `fromISO` to `toISO`, inclusive — capped at 92
 * days (~3 months) so a wide custom range can't render an unbounded number
 * of bars. */
function daysBetween(fromISO: string, toISO: string): Date[] {
  const from = new Date(`${fromISO}T00:00:00`)
  const to = new Date(`${toISO}T00:00:00`)
  const days: Date[] = []
  const cursor = new Date(from)
  let guard = 0
  while (cursor.getTime() <= to.getTime() && guard < 92) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
    guard++
  }
  return days
}

/** Weekday name for a short range ("Mon") — for anything longer than a
 * week that'd repeat too often to tell days apart, so it switches to a
 * date ("12 Sep") instead. */
function dayLabel(d: Date, totalDays: number): string {
  return totalDays <= 7
    ? d.toLocaleDateString('en-IN', { weekday: 'short' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Price adjustment (increase-only, on the base amount) applied before
 * discount — see app/billing_math.py on the backend for the canonical
 * version. There's no decrease direction here; decreasing the price is
 * what discount is for. */
function applyPriceAdjustment(
  baseAmount: number,
  type: 'percent' | 'amount' | null | undefined,
  value: number | null | undefined,
): number {
  if (!type || !value) return baseAmount
  const amount = type === 'percent' ? baseAmount * (value / 100) : value
  return baseAmount + amount
}

/** What this one treatment actually contributes to revenue — mirrors the
 * backend's own _treatment_charge (and BillingTab's copy of the same
 * math) so the pie charts below always agree with the Billing tab: the
 * price adjustment is applied first, then the discount on top of that
 * already-adjusted price. */
function treatmentCharge(t: Treatment): number {
  const adjusted = applyPriceAdjustment(t.servicePrice, t.priceAdjustmentType, t.priceAdjustmentValue)
  let discount = 0
  if (t.discountType && t.discountValue) {
    discount = t.discountType === 'percent' ? adjusted * (t.discountValue / 100) : t.discountValue
    discount = Math.min(discount, adjusted)
  }
  return adjusted - discount
}

/** Same math, for a consultation's fee. */
function consultationCharge(c: Consultation): number {
  const adjusted = applyPriceAdjustment(c.fee, c.priceAdjustmentType, c.priceAdjustmentValue)
  let discount = 0
  if (c.discountType && c.discountValue) {
    discount = c.discountType === 'percent' ? adjusted * (c.discountValue / 100) : c.discountValue
    discount = Math.min(discount, adjusted)
  }
  return adjusted - discount
}

// This page's own copy of the pastel set (PatientList.tsx's stat tiles keep
// a separate copy too, STAT_COLORS) — kept per-file rather than shared so
// either can add/reorder colors without affecting the other.
const PASTELS = [
  { bg: '#EDEBFB', fg: '#6C5CE7' }, // lavender
  { bg: '#E1F1FC', fg: '#2F8FE0' }, // sky blue
  { bg: '#FBE7F0', fg: '#E15B96' }, // pink
  { bg: '#E2F7EC', fg: '#1FAE72' }, // mint
]

// Just the 4 top stat tiles — the charts below keep the PASTELS set above
// unchanged. More saturated than PASTELS on purpose (these are the first
// thing on the page), and each of the 4 tiles now gets its own distinct
// color — Due Soon and Payment Dues used to both land on PASTELS[2] (pink),
// since colorIndex was passed by hand at each call site.
const STAT_PASTELS = [
  { bg: '#DCEEFC', fg: '#1D74C7' }, // blue — Total Patients
  { bg: '#DCF5E3', fg: '#189F55' }, // green — Ongoing Treatments
  { bg: '#EAE3FC', fg: '#6D3FD1' }, // violet — Due Soon
  { bg: '#FCE1E1', fg: '#D8433A' }, // red — Payment Dues
]

const STAT_LIST_META: Record<StatKey, { title: string; empty: string }> = {
  ongoing: { title: 'Ongoing Treatments', empty: 'No ongoing treatments.' },
  due: { title: 'Payment Dues', empty: 'No one has an outstanding balance.' },
  dueSoonCalls: { title: 'Due Soon', empty: 'No next-call dates overdue or due in the next 7 days.' },
}

export function Dashboard() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'admin'
  const { patients, loading: patientsLoading } = usePatients()
  const { serviceName } = useClinic()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [openList, setOpenList] = useState<StatKey | null>(null)
  // Quick Actions' "Add Consultation"/"Add Payment" — same picker-first flow
  // QuickAddMenu's own two actions use, but there's no "already viewing a
  // patient" shortcut here (this is the Dashboard, never a patient's own
  // page), so it always asks.
  const [quickActionMode, setQuickActionMode] = useState<'consultation' | 'payment' | null>(null)
  // Drives only the two trend charts (Patients seen, Payments) — everything
  // else on this page (the 4 top stat tiles, Services opted, Revenue by
  // Service, Payment Mode Split, Collected vs Outstanding) stays exactly as
  // it was: either a "right now" snapshot or an all-time total, not
  // something a date range applies to.
  const [fromDate, setFromDate] = useState(daysAgo(6))
  const [toDate, setToDate] = useState(daysAgo(0))
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  const dateFilterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dateFilterOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setDateFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dateFilterOpen])

  // Matches the active preset if one exactly fits the current from/to,
  // otherwise this is a custom range — drives both the trigger button's
  // label and each trend chart's title.
  const activePreset = DATE_PRESETS.find((p) => {
    const [f, t] = p.range()
    return f === fromDate && t === toDate
  })
  const rangeText = activePreset ? activePreset.label : fromDate === toDate ? formatDate(fromDate) : `${formatDate(fromDate)} to ${formatDate(toDate)}`

  function handleQuickActionPatient(patient: Patient) {
    const code = formatPatientId(patient.patientNumber)
    const section = quickActionMode === 'payment' ? 'billing' : 'consultations'
    const state = quickActionMode === 'payment' ? { openPayment: true } : { openForm: true }
    setQuickActionMode(null)
    navigate(`/admin/patients/${code}/${section}`, { state })
  }

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
        const [consultations, treatments, billingSummary, payments, nextCalls] = await Promise.all([
          clinicalApi.listConsultations(patient.id),
          clinicalApi.listTreatments(patient.id),
          isAdmin ? clinicalApi.getBillingSummary(patient.id) : Promise.resolve(null),
          isAdmin ? clinicalApi.listPatientPayments(patient.id) : Promise.resolve([]),
          clinicalApi.listNextCalls(patient.id),
        ])
        return { patient, consultations, treatments, billingSummary, payments, nextCalls }
      }),
    ).then((groups) => {
      if (cancelled) return

      const now = new Date()
      const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * MS_PER_DAY)

      const countsByDate: Record<string, number> = {}
      const countsByService: Record<string, number> = {}
      const lists: Record<StatKey, ListItem[]> = {
        ongoing: [],
        due: [],
        dueSoonCalls: [],
      }
      // Sorted separately below (most owed first) rather than in
      // patient-fetch order.
      const dueRows: { id: string; to: string; primary: string; outstanding: number }[] = []
      // Overdue or due within DUE_SOON_WINDOW_DAYS, still upcoming (not yet
      // marked done) — the structured replacement for the old free-text
      // "Due for Re-call" card.
      const dueSoonRows: { id: string; to: string; primary: string; scheduledAt: string }[] = []

      // Every day in the selected range (today included, when the range
      // reaches that far) — payments (from PatientPayment, same source the
      // old "Payments Today" tile counted) get bucketed into whichever of
      // these they land in below, via isSameLocalDay rather than
      // string-matching paidAt's date (which is a tz-aware instant, not a
      // bare date).
      const rangeDays = daysBetween(fromDate, toDate)
      const paymentAmountByDayIndex = new Array(rangeDays.length).fill(0) as number[]

      // The three business/billing pie charts — admin-only, same as the
      // Payment Dues card and the payments-by-day chart below.
      const revenueByServiceMap: Record<string, number> = {}
      const paymentModeTotals: Record<string, number> = { cash: 0, card: 0, upi: 0 }
      let paidSum = 0
      let outstandingSum = 0

      for (const { patient, consultations, treatments, billingSummary, payments, nextCalls } of groups) {
        const code = formatPatientId(patient.patientNumber)

        for (const nextCall of nextCalls) {
          if (nextCall.status !== 'upcoming') continue
          if (new Date(nextCall.scheduledAt).getTime() > dueSoonCutoff.getTime()) continue
          dueSoonRows.push({
            id: nextCall.id,
            to: `/admin/patients/${code}/next-call`,
            primary: patient.name,
            scheduledAt: nextCall.scheduledAt,
          })
        }

        if (billingSummary) {
          // Collected (paidSum) comes from the range-filtered payments/paid-
          // consultations loops below instead, now that it range-filters —
          // billingSummary.totalPaid is a single all-time cumulative figure
          // per patient with no per-transaction dates, so it can't. Outstanding
          // stays that all-time figure regardless: an unpaid balance is a
          // "right now" snapshot, not something that happened within a range.
          outstandingSum += billingSummary.totalOutstanding
          if (billingSummary.totalOutstanding > 0) {
            dueRows.push({
              id: patient.id,
              to: `/admin/patients/${code}/billing`,
              primary: patient.name,
              outstanding: billingSummary.totalOutstanding,
            })
          }
        }
        for (const payment of payments) {
          const paidAtDate = new Date(payment.paidAt)
          const dayIndex = rangeDays.findIndex((d) => isSameLocalDay(d, paidAtDate))
          if (dayIndex !== -1) paymentAmountByDayIndex[dayIndex] += payment.amount
          // Payment Mode Split and Collected (in Collected vs Outstanding)
          // both range-filter, per request — Outstanding can't, see below.
          if (inRange(payment.paidAt, fromDate, toDate)) {
            paymentModeTotals[payment.paymentMode] = (paymentModeTotals[payment.paymentMode] ?? 0) + payment.amount
            paidSum += payment.amount
          }
        }

        for (const treatment of treatments) {
          // Pending (added, not started) treatments aren't performed or
          // billed yet — skip them for both the service stats and revenue.
          if (treatment.status === 'pending') continue

          if (treatment.status === 'ongoing') {
            lists.ongoing.push({
              id: treatment.id,
              to: `/admin/patients/${code}/treatments`,
              primary: patient.name,
              // Guaranteed set — only a pending treatment (skipped above) has no startedAt.
              secondary: `${serviceName(treatment.serviceId)} · started ${formatDate(treatment.startedAt!)}`,
            })
          }

          // Services opted and Revenue by Service both range-filter (by
          // when the treatment started) per request — the Ongoing
          // Treatments list just above doesn't; it's a "right now" list,
          // not a trend.
          if (!inRange(treatment.startedAt, fromDate, toDate)) continue
          countsByService[treatment.serviceId] = (countsByService[treatment.serviceId] ?? 0) + 1
          revenueByServiceMap[treatment.serviceId] = (revenueByServiceMap[treatment.serviceId] ?? 0) + treatmentCharge(treatment)
        }

        // Consultation payments aren't in the PatientPayment list above —
        // they're settled via the older paymentStatus/paymentMode flag
        // directly on the consultation — so fold those into the payment
        // mode split (and Collected) too, or it'd badly understate them.
        if (isAdmin) {
          for (const consultation of consultations) {
            if (consultation.paymentStatus === 'paid' && consultation.paymentMode && inRange(consultation.consultDate, fromDate, toDate)) {
              const charge = consultationCharge(consultation)
              paymentModeTotals[consultation.paymentMode] = (paymentModeTotals[consultation.paymentMode] ?? 0) + charge
              paidSum += charge
            }
          }
        }

        for (const consultation of consultations) {
          countsByDate[consultation.consultDate] = (countsByDate[consultation.consultDate] ?? 0) + 1
        }
      }

      dueRows.sort((a, b) => b.outstanding - a.outstanding) // most owed first
      lists.due = dueRows.map((row) => ({ id: row.id, to: row.to, primary: row.primary, secondary: formatINR(row.outstanding) }))

      const paymentsByDay: DayAmount[] = rangeDays.map((d, i) => ({
        date: isoDate(d),
        label: dayLabel(d, rangeDays.length),
        amount: paymentAmountByDayIndex[i],
      }))

      dueSoonRows.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) // soonest/most overdue first
      lists.dueSoonCalls = dueSoonRows.map((row) => {
        const overdue = new Date(row.scheduledAt).getTime() < now.getTime()
        return {
          id: row.id,
          to: row.to,
          primary: row.primary,
          secondary: `${formatDateTime(row.scheduledAt)}${overdue ? ' · Overdue' : ''}`,
        }
      })

      // Every day in the selected range, oldest first — how many patients
      // were seen (had a consultation logged) each day.
      const patientsPerDay: DayCount[] = rangeDays.map((d) => {
        const date = isoDate(d)
        return { date, label: dayLabel(d, rangeDays.length), count: countsByDate[date] ?? 0 }
      })

      // All-time, how many times each service has been opted into (a
      // treatment started for it) — sorted most to least popular.
      const servicesOpted = Object.entries(countsByService)
        .map(([serviceId, count]) => ({ name: serviceName(serviceId), count }))
        .sort((a, b) => b.count - a.count)

      // All-time revenue (₹, discount-adjusted) by service — top 6 named,
      // the rest folded into "Other" so the pie stays readable.
      const revenueSorted = Object.entries(revenueByServiceMap)
        .map(([serviceId, value]) => ({ name: serviceName(serviceId), value }))
        .sort((a, b) => b.value - a.value)
      const revenueByService: PieDatum[] = revenueSorted.slice(0, 6)
      const otherRevenue = revenueSorted.slice(6).reduce((sum, r) => sum + r.value, 0)
      if (otherRevenue > 0) revenueByService.push({ name: 'Other', value: otherRevenue })

      // How collected revenue splits across payment methods — combines
      // PatientPayment records with paid-consultation fees (see above).
      const paymentModeSplit: PieDatum[] = Object.entries(paymentModeTotals)
        .filter(([, value]) => value > 0)
        .map(([mode, value]) => ({ name: mode.toUpperCase(), value }))

      // Of everything ever billed, how much has actually been collected —
      // two slices, not three: "Billed" is the sum of the other two, not a
      // third part of the same pie.
      const billingBreakdown: PieDatum[] = [
        { name: 'Collected', value: paidSum },
        { name: 'Outstanding', value: outstandingSum },
      ].filter((d) => d.value > 0)

      setData({
        totalPatients: patients.length,
        patientsPerDay,
        servicesOpted,
        revenueByService,
        paymentModeSplit,
        billingBreakdown,
        paymentsByDay,
        lists,
      })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serviceName is stable enough in practice (services list rarely changes mid-session); including it would refire this fairly expensive fetch on every ClinicContext refresh.
  }, [patients, patientsLoading, fromDate, toDate])

  const loading = patientsLoading || data === null



  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1>Hello, Ranco Dental</h1>
      </div>

      {loading ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <PastelStat {...STAT_PASTELS[0]} icon={Users} value={data!.totalPatients} label="Total Patients" to="/admin/patients" />
            <PastelStat
              {...STAT_PASTELS[1]}
              icon={Stethoscope}
              value={data!.lists.ongoing.length}
              label="Ongoing Treatments"
              onClick={() => setOpenList('ongoing')}
            />
            {/* Not admin-only — the Next Call tab itself is open to every
                staff, same as Timeline/Consultations/Treatments. */}
            <PastelStat
              {...STAT_PASTELS[2]}
              icon={PhoneCall}
              value={data!.lists.dueSoonCalls.length}
              label="Due Soon"
              onClick={() => setOpenList('dueSoonCalls')}
            />
            {/* Billing is admin-only everywhere else in the app — same rule here. */}
            {isAdmin && (
              <PastelStat
                {...STAT_PASTELS[3]}
                icon={Wallet}
                value={data!.lists.due.length}
                label="Payment Dues"
                onClick={() => setOpenList('due')}
              />
            )}
          </div>

          <DashboardCard title="Quick Actions" className="!bg-[#EAF5FE]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuickActionButton icon={UserPlus} label="Add Patient" to="/admin/patients/new" bg={STAT_PASTELS[0].bg} fg={STAT_PASTELS[0].fg} />
              <QuickActionButton
                icon={Stethoscope}
                label="Add Consultation"
                onClick={() => setQuickActionMode('consultation')}
                bg={STAT_PASTELS[1].bg}
                fg={STAT_PASTELS[1].fg}
              />
              {/* Billing is admin-only everywhere else in the app — same rule here. */}
              {isAdmin && (
                <QuickActionButton
                  icon={CreditCard}
                  label="Add Payment"
                  onClick={() => setQuickActionMode('payment')}
                  bg={STAT_PASTELS[3].bg}
                  fg={STAT_PASTELS[3].fg}
                />
              )}
              <QuickActionButton icon={Search} label="Search Patient" to="/admin/patients" bg={STAT_PASTELS[2].bg} fg={STAT_PASTELS[2].fg} />
            </div>
          </DashboardCard>

          {/* Drives only the two trend charts right below (Patients seen,
              Payments) — see the note by fromDate/toDate's own state. */}
          <div className="relative w-fit" ref={dateFilterRef}>
            <button
              type="button"
              onClick={() => setDateFilterOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-rule bg-white px-3.5 py-2.5 text-body text-ink-soft transition-colors hover:text-ink"
            >
              <Calendar size={16} className="shrink-0" />
              {rangeText}
            </button>

            {dateFilterOpen && (
              <div className="absolute left-0 z-10 mt-2 flex w-[320px] max-w-[calc(100vw-3rem)] flex-col gap-4 rounded-xl border border-rule bg-white p-4 shadow-lg">
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
                      className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                        activePreset?.label === preset.label
                          ? 'border-accent bg-accent-tint text-accent-deep'
                          : 'border-rule text-ink-soft hover:border-accent hover:text-accent-deep'
                      }`}
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
                      max={toDate}
                      className="rounded-lg border border-rule bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                    />
                  </label>
                  <span className="mt-5 text-ink-faint">to</span>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-[12px] font-medium text-ink-faint">To</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      min={fromDate}
                      max={daysAgo(0)}
                      className="rounded-lg border border-rule bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                    />
                  </label>
                </div>

                <div className="flex justify-end border-t border-rule pt-3">
                  <Button type="button" onClick={() => setDateFilterOpen(false)}>
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <DashboardCard title={`Patients seen (${rangeText})`} to="/admin/patients" className="lg:col-span-3">
              <PatientsPerDayChart data={data!.patientsPerDay} />
            </DashboardCard>
            <DashboardCard title={`Services opted (${rangeText})`} to="/admin/services" className="lg:col-span-2">
              <ServicesOptedChart data={data!.servicesOpted} />
            </DashboardCard>
          </div>

          {/* Business/billing charts — admin-only, same as the Payment Dues
              card above. */}
          {isAdmin && (
            <DashboardCard title={`Payments (${rangeText})`}>
              <PaymentsByDayChart data={data!.paymentsByDay} />
            </DashboardCard>
          )}

          {isAdmin && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <DashboardCard title={`Revenue by Service (${rangeText})`} className="!bg-[#EDEBFB]">
                <DashboardBarChart data={data!.revenueByService} valueFormatter={formatINR} emptyMessage="No revenue yet." />
              </DashboardCard>
              {/* Vertical, unlike its two siblings here — breaks up the row
                  instead of three identical horizontal-bar cards in a line. */}
              <DashboardCard title={`Payment Mode Split (${rangeText})`} className="!bg-[#E1F1FC]">
                <DashboardVerticalBarChart data={data!.paymentModeSplit} valueFormatter={formatINR} emptyMessage="No payments recorded yet." />
              </DashboardCard>
              {/* "Outstanding" here can't range-filter the same way — see the
                  note by paidSum above — so this card mixes a range-filtered
                  Collected with an always-current Outstanding. Named plainly
                  rather than implying both halves obey the filter. */}
              <DashboardCard title="Collected vs Outstanding (current)" className="!bg-[#F1EAFC]">
                <DashboardBarChart data={data!.billingBreakdown} valueFormatter={formatINR} emptyMessage="Nothing billed yet." />
              </DashboardCard>
            </div>
          )}

          {openList && (
            <StatListModal
              title={STAT_LIST_META[openList].title}
              emptyMessage={STAT_LIST_META[openList].empty}
              items={data!.lists[openList]}
              onClose={() => setOpenList(null)}
            />
          )}

          {quickActionMode && (
            <PatientPicker
              title={quickActionMode === 'payment' ? 'Add payment for…' : 'Add consultation for…'}
              onSelect={handleQuickActionPatient}
              onClose={() => setQuickActionMode(null)}
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

function DashboardCard({
  title,
  to,
  className = '',
  children,
}: {
  title: string
  /** When set, the title becomes a link to somewhere that shows this same
   * data in more depth ("Patients seen" → the Patients list, …) — not every
   * card has an obvious "view more" destination, so this stays optional. */
  to?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_4px_24px_-8px_rgba(30,40,70,0.12)] transition-shadow duration-150 hover:shadow-[0_8px_32px_-8px_rgba(30,40,70,0.2)] ${className}`}
    >
      {to ? (
        <Link to={to} className="group flex items-center gap-1.5 text-subheading font-medium text-ink transition-colors hover:text-accent-deep">
          {title}
          <ArrowRight size={14} className="-translate-x-1 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100" />
        </Link>
      ) : (
        <p className="text-subheading font-medium text-ink">{title}</p>
      )}
      {children}
    </div>
  )
}

function QuickActionButton({
  icon: Icon,
  label,
  to,
  onClick,
  bg,
  fg,
}: {
  icon: ComponentType<{ size?: number }>
  label: string
  to?: string
  onClick?: () => void
  bg: string
  fg: string
}) {
  const content = (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-rule bg-white p-4 text-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: bg, color: fg }}>
        <Icon size={20} />
      </span>
      <span className="text-[13px] font-medium text-ink">{label}</span>
    </div>
  )
  if (to) return <Link to={to}>{content}</Link>
  return (
    <button type="button" onClick={onClick} className="w-full">
      {content}
    </button>
  )
}

function PatientsPerDayChart({ data }: { data: DayCount[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  if (total === 0) {
    return <p className="py-10 text-center text-body text-ink-soft">No patients seen in this range.</p>
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
        <Area type="monotone" dataKey="count" stroke="#2F8FE0" strokeWidth={2.5} fill="url(#patientsFill)">
          <LabelList
            dataKey="count"
            position="top"
            formatter={(value) => (typeof value === 'number' && value > 0 ? value : '')}
            style={{ fontSize: 11, fontWeight: 600, fill: '#2F8FE0' }}
          />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Replaced the old same-day-only "Payments Today" stat tile — a proper
 * 7-day trend instead of just a count. Same PatientPayment source that
 * tile counted (see the payment-bucketing loop above), not consultation-fee
 * payments — kept identical in scope, just spread across a week now. */
function PaymentsByDayChart({ data }: { data: DayAmount[] }) {
  const total = data.reduce((sum, d) => sum + d.amount, 0)
  if (total === 0) {
    return <p className="py-10 text-center text-body text-ink-soft">No payments recorded in this range.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8894a3' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#8894a3' }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          cursor={false}
          contentStyle={{ borderRadius: 12, border: '1px solid #e1e7ef', fontSize: 13 }}
          labelFormatter={(label, payload) => payload?.[0]?.payload?.date ?? label}
          formatter={(value) => [formatINR(typeof value === 'number' ? value : 0), 'Collected']}
        />
        <Bar dataKey="amount" radius={[8, 8, 0, 0]} fill={PASTELS[3].fg}>
          <LabelList
            dataKey="amount"
            position="top"
            formatter={(value) => (typeof value === 'number' && value > 0 ? formatINR(value) : '')}
            style={{ fontSize: 11, fontWeight: 600, fill: '#1FAE72' }}
          />
        </Bar>
      </BarChart>
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
          cursor={false}
          contentStyle={{ borderRadius: 12, border: '1px solid #e1e7ef', fontSize: 13 }}
          formatter={(value) => [`${value} opted`, '']}
        />
        <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={16}>
          {top.map((entry, i) => (
            <Cell key={entry.name} fill={PASTELS[i % PASTELS.length].fg} />
          ))}
          <LabelList dataKey="count" position="right" style={{ fontSize: 12, fontWeight: 600, fill: '#101826' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Shared by all three business/billing cards — was a pie/donut chart,
 * switched to the same horizontal-bar look ServicesOptedChart already uses
 * (name left, bar, value at the end) on request — "cleaner" than pies. */
function DashboardBarChart({
  data,
  valueFormatter,
  emptyMessage,
}: {
  data: PieDatum[]
  valueFormatter: (value: number) => string
  emptyMessage: string
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-body text-ink-soft">{emptyMessage}</p>
  }
  const total = data.reduce((sum, d) => sum + d.value, 0)
  // Each row needs its own ~40px or the category labels/value labels start
  // overlapping (rows squeezed to fit a too-short fixed height was exactly
  // that bug) — so the chart itself is always sized to fit every row, and
  // this wrapper caps how tall that's allowed to get before it scrolls
  // instead of the card just growing forever for a long list.
  const height = Math.max(140, data.length * 40)
  return (
    <div className="max-h-[320px] overflow-y-auto">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#101826' }} axisLine={false} tickLine={false} width={110} />
          <Tooltip
            cursor={false}
            contentStyle={{ borderRadius: 12, border: '1px solid #e1e7ef', fontSize: 13 }}
            formatter={(value) => {
              const numeric = typeof value === 'number' ? value : 0
              return [`${valueFormatter(numeric)} (${total ? Math.round((numeric / total) * 100) : 0}%)`, '']
            }}
          />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={16}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={PASTELS[i % PASTELS.length].fg} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(value) => (typeof value === 'number' ? valueFormatter(value) : '')}
              style={{ fontSize: 12, fontWeight: 600, fill: '#101826' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Same data shape as DashboardBarChart, upright instead of sideways — used
 * for Payment Mode Split so the row of 3 billing cards isn't three
 * identical-looking horizontal bar charts in a line. */
function DashboardVerticalBarChart({
  data,
  valueFormatter,
  emptyMessage,
}: {
  data: PieDatum[]
  valueFormatter: (value: number) => string
  emptyMessage: string
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-body text-ink-soft">{emptyMessage}</p>
  }
  const total = data.reduce((sum, d) => sum + d.value, 0)
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#8894a3' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#8894a3' }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          cursor={false}
          contentStyle={{ borderRadius: 12, border: '1px solid #e1e7ef', fontSize: 13 }}
          formatter={(value) => {
            const numeric = typeof value === 'number' ? value : 0
            return [`${valueFormatter(numeric)} (${total ? Math.round((numeric / total) * 100) : 0}%)`, '']
          }}
        />
        <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={40}>
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={PASTELS[i % PASTELS.length].fg} />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            formatter={(value) => (typeof value === 'number' ? valueFormatter(value) : '')}
            style={{ fontSize: 12, fontWeight: 600, fill: '#101826' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function PastelStat({
  bg,
  fg,
  icon: Icon,
  value,
  label,
  to,
  onClick,
}: {
  bg: string
  fg: string
  icon: ComponentType<{ size?: number; className?: string }>
  value: number
  label: string
  to?: string
  onClick?: () => void
}) {
  const content = (
    <div
      className="group flex h-full flex-col justify-between gap-4 rounded-2xl p-4 text-left shadow-[0_4px_20px_-8px_rgba(30,40,70,0.1)] transition-all duration-150 hover:-translate-y-1 hover:shadow-[0_10px_28px_-8px_rgba(30,40,70,0.25)]"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70" style={{ color: fg }}>
          <Icon size={18} />
        </span>
        {/* Only a hint on hover — every tile here already leads somewhere
            (a page or a list popup), this just makes that more obvious. */}
        <ArrowRight size={14} className="-translate-x-1 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-60" style={{ color: fg }} />
      </div>
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
