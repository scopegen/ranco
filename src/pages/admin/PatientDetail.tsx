import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePatients, type Patient } from '../../state/PatientsContext'
import { useClinic } from '../../state/ClinicContext'
import { useAuth } from '../../state/AuthContext'
import { clinicalApi } from '../../lib/clinicalApi'
import { calculateAge } from '../../lib/age'
import { findPatientByCode, formatPatientId } from '../../lib/patientId'
import { formatDate } from '../../lib/date'
import { Pill } from '../../components/Pill'
import type { Consultation, Invoice, PatientBillingSummary, PrescriptionEntry, Treatment, Visit } from '../../types/clinical'

type BusyAction = 'view-prescriptions' | 'save-prescriptions' | 'view-history' | null

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
}

// Shared with every section page (Overview, Timeline, Consultations,
// Treatments, Billing) via useOutletContext() — fetched once here, in the
// layout, rather than separately per section.
export interface PatientDetailContext {
  patient: Patient
  data: PatientClinicalData
  refresh: () => Promise<void>
  isAdmin: boolean
  busy: BusyAction
  actionError: string | null
  handleViewPrescriptions: () => Promise<void>
  handleSavePrescriptions: () => Promise<void>
  // Kept available even though no button currently triggers it — the "Full
  // History PDF" button was removed from the UI, but the document/feature
  // itself wasn't.
  handleViewHistory: () => Promise<void>
}

export function PatientDetail() {
  const { code } = useParams()
  const location = useLocation()
  // The full patient-info block only makes sense on the overview (the card
  // list) — section pages (Consultations, Treatments, …) show just the name,
  // since the point of navigating there is the section's own content.
  const isOverview = location.pathname.replace(/\/+$/, '') === `/admin/patients/${code}`
  const { patients, loading: patientsLoading } = usePatients()
  const { viewPrescriptionsPdf, savePrescriptionsPdf, viewHistoryPdf } = useClinic()
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'admin'
  const patient = useMemo(() => (code ? findPatientByCode(patients, code) : undefined), [patients, code])

  const [data, setData] = useState<PatientClinicalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleViewPrescriptions() {
    if (!patient) return
    setBusy('view-prescriptions')
    setActionError(null)
    try {
      await viewPrescriptionsPdf(patient.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate the document')
    } finally {
      setBusy(null)
    }
  }

  async function handleSavePrescriptions() {
    if (!patient) return
    setBusy('save-prescriptions')
    setActionError(null)
    try {
      await savePrescriptionsPdf(patient.id, `prescriptions-${formatPatientId(patient.patientNumber)}.pdf`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate the document')
    } finally {
      setBusy(null)
    }
  }

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
    const [consultations, treatments, prescriptions, invoices, billingSummary] = await Promise.all([
      clinicalApi.listConsultations(patientId),
      clinicalApi.listTreatments(patientId),
      clinicalApi.listPrescriptionsForPatient(patientId),
      // Admin-only endpoints — skip entirely for doctors, who never see the
      // Billing tab, so a 403 here would otherwise break page load.
      isAdmin ? clinicalApi.listInvoices(patientId) : Promise.resolve([]),
      isAdmin ? clinicalApi.getBillingSummary(patientId) : Promise.resolve(null),
    ])

    const visitsByTreatment: Record<string, Visit[]> = {}
    await Promise.all(
      treatments.map(async (t) => {
        visitsByTreatment[t.id] = await clinicalApi.listVisits(t.id)
      }),
    )

    setData({ consultations, treatments, visitsByTreatment, billingSummary, invoices, prescriptions })
    setLoading(false)
  }, [patient, isAdmin])

  useEffect(() => {
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

  return (
    <div className="relative">
      {/* Flush against the left edge of the content area (next to the sidebar), not pulled into the centered column below — only on the overview; the section pages (Consultations, Treatments, …) don't show this row at all */}
      {isOverview && (
        <div className="flex items-center gap-2 px-6 pt-6 md:px-8">
          <Link
            to="/admin/patients"
            aria-label="Back to patients"
            title="Back to patients"
            className="flex items-center justify-center rounded-full border border-rule bg-paper-raised p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
          >
            <ArrowLeft size={16} />
          </Link>
          <p className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium uppercase tracking-wider text-accent">
            Admin · Patients
          </p>
        </div>
      )}

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        {isOverview ? (
          <header className="flex flex-col gap-3">

            {/* Mobile: name on the left, patient info on the right of the same row */}
            <div className="flex items-start justify-between gap-3 md:hidden">
              <h1>{patient.name}</h1>
              <p className="text-right text-[13px] leading-snug text-ink-soft">
                <span className="font-mono">{formatPatientId(patient.patientNumber)}</span>
                <br />
                {age === null ? '—' : `${age} yrs`} · {patient.phone}
              </p>
            </div>

            {/* Desktop: name on the left, ID/age/phone on the right, spread across the row */}
            <div className="hidden items-center justify-between gap-4 md:flex">
              <h1>{patient.name}</h1>
              <span className="text-ink-soft">
                <span className="font-mono">{formatPatientId(patient.patientNumber)}</span> · {age === null ? '—' : `${age} yrs`} · {patient.phone}
              </span>
            </div>

            {actionError && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{actionError}</p>}

            {patient.medicalConditions.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1.5">
                {patient.medicalConditions.map((condition) => (
                  <Pill key={condition} variant="crit">
                    {condition}
                  </Pill>
                ))}
              </div>
            )}

            <div className="flex flex-col divide-y divide-rule rounded-xl border border-rule bg-white px-4">
              <InfoRow label="Address" value={patient.address} />
              <InfoRow
                label="Birthdate"
                value={
                  patient.dob
                    ? `${formatDate(patient.dob)}${age !== null ? ` (Age: ${age})` : ''}`
                    : patient.birthYear
                      ? `Birth year ${patient.birthYear}${age !== null ? ` (Age: ${age})` : ''}`
                      : '—'
                }
              />
              <InfoRow label="Gender" value={patient.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : '—'} />
              <InfoRow label="Height" value={patient.height ? `${patient.height} cm` : '— cm'} />
              <InfoRow label="Weight" value={patient.weight ? `${patient.weight} kg` : '— kg'} />
              <InfoRow label="Date Added" value={formatDate(patient.registeredAt)} />
              <InfoRow label="Emergency Contact — Name" value={patient.emergencyContactName || '—'} />
              <InfoRow label="Emergency Contact — Number" value={patient.emergencyContactPhone || '—'} />
            </div>
          </header>
        ) : (
          <header className="flex flex-col gap-2">
            <h1>{patient.name}</h1>
            {actionError && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{actionError}</p>}
          </header>
        )}

        {loading || !data ? (
          <p className="text-ink-soft">Loading…</p>
        ) : (
          <Outlet
            context={
              {
                patient,
                data,
                refresh,
                isAdmin,
                busy,
                actionError,
                handleViewPrescriptions,
                handleSavePrescriptions,
                handleViewHistory,
              } satisfies PatientDetailContext
            }
          />
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-body">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  )
}
