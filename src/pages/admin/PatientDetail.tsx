import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, ChevronRight, Clock, Home, Hourglass, Pencil, Phone, PhoneCall, Plus, Stethoscope, UserRound, Wallet } from 'lucide-react'
import { usePatients, type Patient } from '../../state/PatientsContext'
import { useClinic } from '../../state/ClinicContext'
import { useAuth } from '../../state/AuthContext'
import { clinicalApi } from '../../lib/clinicalApi'
import { calculateAge } from '../../lib/age'
import { findPatientByCode, formatPatientId } from '../../lib/patientId'
import { formatDate } from '../../lib/date'
import { Pill } from '../../components/Pill'
import { Button } from '../../components/Button'
import type { Consultation, Invoice, NextCall, PatientBillingSummary, PrescriptionEntry, Treatment, Visit } from '../../types/clinical'

type BusyAction = 'view-history' | null

export interface PatientClinicalData {
  consultations: Consultation[]
  treatments: Treatment[]
  visitsByTreatment: Record<string, Visit[]>
  // Admin-only — never fetched for doctors, since the Billing tab is
  // completely hidden from them and this endpoint is require_admin anyway.
  // The single combined bill for the patient — discounts live on each
  // Treatment already fetched above, so no per-treatment billing call is
  // needed anymore.
  billingSummary: PatientBillingSummary | null
  invoices: Invoice[]
  prescriptions: PrescriptionEntry[]
  // Every next-call entry ever added for this patient — a history, not just
  // the current upcoming one. Any staff can see/use this, not admin-only.
  nextCalls: NextCall[]
}

// Shared with every section overlay (Timeline, Consultations, Treatments,
// Next Call, Billing) via useOutletContext() — fetched once here, in the
// layout, rather than separately per section.
export interface PatientDetailContext {
  patient: Patient
  data: PatientClinicalData
  refresh: () => Promise<void>
  isAdmin: boolean
  busy: BusyAction
  actionError: string | null
  // Kept available even though no button currently triggers it — the "Full
  // History PDF" button was removed from the UI, but the document/feature
  // itself wasn't.
  handleViewHistory: () => Promise<void>
}

// One color per section — now tinting the whole card (cardBg), not just the
// icon circle (circleBg/fg), plus a short subtitle and a count badge. Same
// five pastels as before, just carried further across each card.
const SECTION_META: Record<
  string,
  { label: string; subtitle: string; icon: ComponentType<{ size?: number }>; cardBg: string; circleBg: string; fg: string }
> = {
  timeline: { label: 'Timeline', subtitle: 'History & activities', icon: Clock, cardBg: '#E8F8EE', circleBg: '#C8EDD7', fg: '#1FAE72' },
  consultations: {
    label: 'Consultations',
    subtitle: 'View & manage',
    icon: Calendar,
    cardBg: '#EAF4FE',
    circleBg: '#CFE6FB',
    fg: '#2F8FE0',
  },
  treatments: {
    label: 'Treatments',
    subtitle: 'View treatment plans',
    icon: Stethoscope,
    cardBg: '#F3EFFC',
    circleBg: '#E0D8F7',
    fg: '#6C5CE7',
  },
  'next-call': {
    label: 'Next Call',
    subtitle: 'Schedule or view',
    icon: PhoneCall,
    cardBg: '#FDEEE3',
    circleBg: '#FBDCC2',
    fg: '#E2691A',
  },
  billing: { label: 'Billing', subtitle: 'Invoices & payments', icon: Wallet, cardBg: '#FDEEF4', circleBg: '#F9D6E4', fg: '#E15B96' },
}

export function PatientDetail() {
  const { code } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  // A child route (timeline/consultations/treatments/next-call/billing) is
  // matched — show its content as a sheet over this page rather than a
  // page of its own; the base patient page (hero + info + section cards)
  // never unmounts underneath it.
  const isOverview = location.pathname.replace(/\/+$/, '') === `/admin/patients/${code}`
  const { patients, loading: patientsLoading } = usePatients()
  const { viewHistoryPdf } = useClinic()
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'admin'
  const patient = useMemo(() => (code ? findPatientByCode(patients, code) : undefined), [patients, code])

  const [data, setData] = useState<PatientClinicalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleViewHistory() {
    if (!patient) return
    setBusy('view-history')
    setActionError(null)
    try {
      await viewHistoryPdf(patient.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate the document')
    } finally {
      setBusy(null)
    }
  }

  const refresh = useCallback(async () => {
    if (!patient) return
    const patientId = patient.id
    setLoading(true)
    const [consultations, treatments, prescriptions, invoices, billingSummary, nextCalls] = await Promise.all([
      clinicalApi.listConsultations(patientId),
      clinicalApi.listTreatments(patientId),
      clinicalApi.listPrescriptionsForPatient(patientId),
      // Admin-only endpoints — skip entirely for doctors, who never see the
      // Billing tab, so a 403 here would otherwise break page load.
      isAdmin ? clinicalApi.listInvoices(patientId) : Promise.resolve([]),
      isAdmin ? clinicalApi.getBillingSummary(patientId) : Promise.resolve(null),
      clinicalApi.listNextCalls(patientId),
    ])

    const visitsByTreatment: Record<string, Visit[]> = {}
    await Promise.all(
      treatments.map(async (t) => {
        visitsByTreatment[t.id] = await clinicalApi.listVisits(t.id)
      }),
    )

    setData({ consultations, treatments, visitsByTreatment, billingSummary, invoices, prescriptions, nextCalls })
    setLoading(false)
  }, [patient, isAdmin])

  useEffect(() => {
    // Pre-existing fetch-on-mount/param-change pattern used the same way
    // throughout the app (Dashboard, PatientList, …) — refresh's own
    // setState calls are the intended effect here, not a side effect of one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  if (!patient) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-6 py-16 text-center">
        <h1>{patientsLoading ? 'Loading…' : 'Patient not found'}</h1>
      </div>
    )
  }

  const age = calculateAge(patient.dob, patient.birthYear)
  const initials =
    patient.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'

  const sectionIds = [
    'timeline',
    // A patient with no consultations yet can't have anything to review on
    // a Consultations page, so that card only appears once one exists — the
    // "+ Add Consultation" button above is how the first one gets created.
    ...(data && data.consultations.length > 0 ? ['consultations'] : []),
    'treatments',
    'next-call',
    ...(isAdmin ? ['billing'] : []),
  ]

  return (
    <div className="relative">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        {/* Back to the patients list — always here now (the hero below no
            longer disappears behind a section page, so this no longer needs
            to hide itself the way it used to). */}
        <div className="flex items-center gap-2">
          <Link
            to="/admin/patients"
            aria-label="Back to patients"
            title="Back to patients"
            className="flex items-center justify-center rounded-full border border-rule bg-paper-raised p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
          >
            <ArrowLeft size={16} />
          </Link>
          <p className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium uppercase tracking-wider text-accent">Admin · Patients</p>
        </div>

        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#EAF5FE] to-[#C7E5FA] p-5 sm:p-6">
          {/* Decorative only — a brighter, more saturated sky blue than the
              muted accent/accent-deep tokens (those read as grey once
              diluted to a low opacity — not enough chroma to survive it),
              but still clearly the same blue family as the top bar. */}
          <svg
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full text-[#BEE1F9]/70 sm:h-28"
            viewBox="0 0 800 120"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0,80 C150,20 350,120 550,60 C650,30 750,70 800,50 L800,120 L0,120 Z" fill="currentColor" />
          </svg>
          <svg
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full text-[#8DCBF2]/60 sm:h-20"
            viewBox="0 0 800 90"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0,60 C200,10 400,90 600,40 C700,15 750,50 800,35 L800,90 L0,90 Z" fill="currentColor" />
          </svg>
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-deep text-heading font-bold text-white">
                {initials}
              </span>
              <div className="flex flex-col gap-1.5">
                <h1>{patient.name}</h1>
                <p className="font-mono text-body text-ink-soft">{formatPatientId(patient.patientNumber)}</p>
                {patient.medicalConditions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {patient.medicalConditions.map((condition) => (
                      <Pill key={condition} variant="crit">
                        {condition}
                      </Pill>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link to={`/admin/patients/${formatPatientId(patient.patientNumber)}/edit`}>
                <Button variant="secondary" className="inline-flex items-center gap-2 !border-rule !text-ink">
                  <Pencil size={15} />
                  Edit
                </Button>
              </Link>
              <Link to="consultations" state={{ openForm: true }}>
                <Button variant="secondary" className="inline-flex items-center gap-2 !border-rule !text-ink">
                  <Plus size={16} />
                  Add Consultation
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {actionError && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{actionError}</p>}

        {/* Info strip */}
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-rule bg-white p-4 sm:grid-cols-3 lg:grid-cols-5">
          <InfoTile icon={Home} label="Address" value={[patient.sector, patient.city].filter(Boolean).join(', ') || '—'} />
          <InfoTile icon={Calendar} label="Date Added" value={formatDate(patient.registeredAt)} />
          <InfoTile icon={Hourglass} label="Age" value={age === null ? '—' : `${age} yrs`} />
          <InfoTile icon={UserRound} label="Gender" value={patient.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : '—'} />
          <InfoTile icon={Phone} label="Mobile Number" value={patient.phone} />
        </div>

        {/* Section cards — a count badge per card, roughly "how many things
            are in there": Timeline approximates its combined event count
            (consultations + treatments) rather than duplicating TimelineTab's
            full event-building logic just for a badge. */}
        {loading || !data ? (
          <p className="text-ink-soft">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sectionIds.map((id) => {
              const meta = SECTION_META[id]
              const count: number =
                id === 'consultations'
                  ? data.consultations.length
                  : id === 'treatments'
                    ? data.treatments.length
                    : id === 'next-call'
                      ? data.nextCalls.filter((nc) => nc.status === 'upcoming').length
                      : id === 'billing'
                        ? data.invoices.length
                        : data.consultations.length + data.treatments.length // timeline
              return (
                <Link
                  key={id}
                  to={id}
                  className="relative flex flex-col gap-2 rounded-xl p-4 shadow-sm transition-transform duration-150 hover:-translate-y-0.5 sm:gap-3 sm:p-5"
                  style={{ backgroundColor: meta.cardBg }}
                >
                  {/* Pinned to the corner rather than sharing a row with the
                      title — at 2-per-row mobile width there's no room for
                      icon + title + subtitle + badge + chevron on one line
                      without clipping or spilling out of the card. */}
                  <div className="absolute right-3 top-3 flex items-center gap-1">
                    {count > 0 && (
                      <span className="hidden rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold sm:inline-block" style={{ color: meta.fg }}>
                        {count}
                      </span>
                    )}
                    <ChevronRight size={18} className="shrink-0 text-ink-faint" />
                  </div>
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11"
                    style={{ backgroundColor: meta.circleBg, color: meta.fg }}
                  >
                    <meta.icon size={18} />
                  </span>
                  <div className="flex flex-col gap-0.5 pr-6">
                    <span className="text-body font-medium text-ink sm:text-subheading">{meta.label}</span>
                    <span className="text-[13px] text-ink-soft">{meta.subtitle}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Section overlay — a bottom sheet over this page, not a page of its
          own, for whichever of the cards above was tapped. Backdrop click
          and the sheet's own close (X, in SectionShell) both land back on
          the bare patient URL, which unmounts this (no route matches). */}
      {!isOverview && data && (
        <>
          <div className="fixed inset-0 z-30 bg-ink/40" onClick={() => navigate(`/admin/patients/${code}`)} aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[85vh] w-full max-w-6xl overflow-y-auto rounded-t-2xl bg-paper p-6 shadow-[0_-8px_30px_-8px_rgba(16,24,38,0.35)] [-ms-overflow-style:none] [scrollbar-width:none] [animation:sheet-slide-up_0.22s_ease-out] [&::-webkit-scrollbar]:hidden">
            <Outlet
              context={
                {
                  patient,
                  data,
                  refresh,
                  isAdmin,
                  busy,
                  actionError,
                  handleViewHistory,
                } satisfies PatientDetailContext
              }
            />
          </div>
        </>
      )}
    </div>
  )
}

function InfoTile({ icon: Icon, label, value }: { icon: ComponentType<{ size?: number }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent-deep">
        <Icon size={18} />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] text-ink-faint">{label}</span>
        <span className="truncate text-body font-medium text-ink">{value}</span>
      </div>
    </div>
  )
}
