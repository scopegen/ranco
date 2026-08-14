import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye, FileText, Pencil } from 'lucide-react'
import { usePatients } from '../../state/PatientsContext'
import { useClinic } from '../../state/ClinicContext'
import { clinicalApi } from '../../lib/clinicalApi'
import { calculateAge } from '../../lib/age'
import { formatPatientId } from '../../lib/patientId'
import { Pill } from '../../components/Pill'
import { Button } from '../../components/Button'
import type { Consultation, Invoice, PrescriptionEntry, Treatment, Visit } from '../../types/clinical'
import { TimelineTab } from './patient-detail/TimelineTab'
import { ConsultationsTab } from './patient-detail/ConsultationsTab'
import { TreatmentsTab } from './patient-detail/TreatmentsTab'
import { BillingTab } from './patient-detail/BillingTab'

const tabs = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'billing', label: 'Billing' },
  { id: 'treatments', label: 'Treatments' },
  { id: 'consultations', label: 'Consultations' },
] as const

type TabId = (typeof tabs)[number]['id']
type BusyAction = 'view-prescriptions' | 'save-prescriptions' | 'view-history' | null

export interface PatientClinicalData {
  consultations: Consultation[]
  treatments: Treatment[]
  visitsByTreatment: Record<string, Visit[]>
  invoiceByTreatment: Record<string, Invoice | undefined>
  prescriptions: PrescriptionEntry[]
}

export function PatientDetail() {
  const { id } = useParams()
  const location = useLocation()
  const { patients } = usePatients()
  const { viewPrescriptionsPdf, savePrescriptionsPdf, viewHistoryPdf } = useClinic()
  const patient = patients.find((p) => p.id === id)
  const requestedTab = (location.state as { tab?: TabId } | null)?.tab
  const [activeTab, setActiveTab] = useState<TabId>(requestedTab ?? 'timeline')

  const [data, setData] = useState<PatientClinicalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleViewPrescriptions() {
    if (!id) return
    setBusy('view-prescriptions')
    setActionError(null)
    try {
      await viewPrescriptionsPdf(id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate the document')
    } finally {
      setBusy(null)
    }
  }

  async function handleSavePrescriptions() {
    if (!id || !patient) return
    setBusy('save-prescriptions')
    setActionError(null)
    try {
      await savePrescriptionsPdf(id, `prescriptions-${formatPatientId(patient.patientNumber)}.pdf`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate the document')
    } finally {
      setBusy(null)
    }
  }

  async function handleViewHistory() {
    if (!id) return
    setBusy('view-history')
    setActionError(null)
    try {
      await viewHistoryPdf(id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate the document')
    } finally {
      setBusy(null)
    }
  }

  const refresh = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [consultations, treatments, prescriptions] = await Promise.all([
      clinicalApi.listConsultations(id),
      clinicalApi.listTreatments(id),
      clinicalApi.listPrescriptionsForPatient(id),
    ])

    const visitsByTreatment: Record<string, Visit[]> = {}
    const invoiceByTreatment: Record<string, Invoice | undefined> = {}
    await Promise.all(
      treatments.map(async (t) => {
        const [visits, invoice] = await Promise.all([clinicalApi.listVisits(t.id), clinicalApi.getInvoice(t.id)])
        visitsByTreatment[t.id] = visits
        invoiceByTreatment[t.id] = invoice
      }),
    )

    setData({ consultations, treatments, visitsByTreatment, invoiceByTreatment, prescriptions })
    setLoading(false)
  }, [id])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!patient) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-6 py-16 text-center">
        <h1>Patient not found</h1>
      </div>
    )
  }

  const age = calculateAge(patient.dob, patient.birthYear)
  const prescriptionsBusy = busy === 'view-prescriptions' || busy === 'save-prescriptions'

  return (
    <div className="relative">
      {/* Desktop: arrow floats in the corner */}
      <Link
        to="/admin/patients"
        aria-label="Back to patients"
        title="Back to patients"
        className="absolute left-4 top-6 hidden items-center justify-center rounded-full p-1.5 text-ink-soft transition-colors hover:bg-paper-raised hover:text-accent-deep sm:left-6 md:flex"
      >
        <ArrowLeft size={18} />
      </Link>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10 pb-40 md:pb-10">
        <header className="flex flex-col gap-3">
          {/* Mobile: arrow + eyebrow in a single row */}
          <div className="flex items-center gap-2 md:hidden">
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

          {/* Mobile: name+edit on the left, patient info on the right of the same row */}
          <div className="flex items-start justify-between gap-3 md:hidden">
            <div className="flex items-center gap-2">
              <h1>{patient.name}</h1>
              <Link
                to={`/admin/patients/${patient.id}/edit`}
                aria-label="Edit profile"
                title="Edit profile"
                className="flex items-center justify-center rounded-full border border-rule bg-white p-1.5 text-ink-soft transition-colors hover:bg-paper-raised hover:text-accent-deep"
              >
                <Pencil size={14} />
              </Link>
            </div>
            <p className="text-right text-[13px] leading-snug text-ink-soft">
              <span className="font-mono">{formatPatientId(patient.patientNumber)}</span>
              <br />
              {age === null ? '—' : `${age} yrs`} · {patient.phone}
            </p>
          </div>

          {/* Desktop: unchanged stacked layout with the PDF buttons on the right */}
          <div className="hidden items-start justify-between gap-4 md:flex">
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-medium uppercase tracking-wider text-accent">Admin · Patients</p>
              <div className="flex items-center gap-2">
                <h1>{patient.name}</h1>
                <Link
                  to={`/admin/patients/${patient.id}/edit`}
                  aria-label="Edit profile"
                  title="Edit profile"
                  className="flex items-center justify-center rounded-full border border-rule bg-white p-1.5 text-ink-soft transition-colors hover:bg-paper-raised hover:text-accent-deep"
                >
                  <Pencil size={14} />
                </Link>
              </div>
              <p className="text-ink-soft">
                <span className="font-mono">{formatPatientId(patient.patientNumber)}</span> · {age === null ? '—' : `${age} yrs`} · {patient.phone}
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <Button variant="secondary" onClick={handleViewPrescriptions} disabled={busy !== null}>
                <FileText size={15} className="mr-1.5 inline" />
                {busy === 'view-prescriptions' ? 'Generating…' : 'Prescriptions PDF'}
              </Button>
              <Button variant="secondary" onClick={handleViewHistory} disabled={busy !== null}>
                <FileText size={15} className="mr-1.5 inline" />
                {busy === 'view-history' ? 'Generating…' : 'Full History PDF'}
              </Button>
            </div>
          </div>

          {actionError && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{actionError}</p>}

          {patient.medicalConditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {patient.medicalConditions.map((condition) => (
                <Pill key={condition} variant="crit">
                  {condition}
                </Pill>
              ))}
            </div>
          )}
        </header>

        {/* Desktop only — mobile gets these tabs in the footer instead */}
        <div className="hidden gap-1 border-b border-rule md:flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-3.5 py-2.5 text-body font-medium transition-colors duration-150 ${
                activeTab === tab.id
                  ? 'border-accent text-accent-deep'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading || !data ? (
          <p className="text-ink-soft">Loading…</p>
        ) : (
          <>
            {activeTab === 'timeline' && <TimelineTab patient={patient} data={data} />}
            {activeTab === 'consultations' && <ConsultationsTab patient={patient} data={data} onChange={refresh} />}
            {activeTab === 'treatments' && <TreatmentsTab patient={patient} data={data} onChange={refresh} />}
            {activeTab === 'billing' && <BillingTab data={data} />}
          </>
        )}
      </div>

      {/* Mobile only: Prescription row + this patient's own tabs, replacing the global bottom nav */}
      <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col md:hidden">
        <div className="flex items-center justify-between gap-2 border-t border-rule bg-white px-4 py-2.5">
          <span className="text-body font-medium text-ink">{prescriptionsBusy ? 'Generating…' : 'Prescription'}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleViewPrescriptions}
              disabled={busy !== null}
              aria-label="View prescriptions"
              title="View"
              className="flex items-center justify-center rounded-full p-2 text-ink-soft transition-colors hover:bg-paper-raised hover:text-accent-deep disabled:opacity-50"
            >
              <Eye size={18} />
            </button>
            <button
              type="button"
              onClick={handleSavePrescriptions}
              disabled={busy !== null}
              aria-label="Download prescriptions"
              title="Download"
              className="flex items-center justify-center rounded-full p-2 text-ink-soft transition-colors hover:bg-paper-raised hover:text-accent-deep disabled:opacity-50"
            >
              <Download size={18} />
            </button>
          </div>
        </div>

        <nav className="flex border-t border-rule bg-white">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150 ${
                activeTab === tab.id ? 'bg-accent-tint text-accent-deep' : 'text-ink-soft'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}