import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
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
  { id: 'consultations', label: 'Consultations' },
  { id: 'treatments', label: 'Treatments' },
  { id: 'billing', label: 'Billing' },
] as const

type TabId = (typeof tabs)[number]['id']

export interface PatientClinicalData {
  consultations: Consultation[]
  treatments: Treatment[]
  visitsByTreatment: Record<string, Visit[]>
  invoiceByTreatment: Record<string, Invoice | undefined>
  prescriptions: PrescriptionEntry[]
}

export function PatientDetail() {
  const { id } = useParams()
  const { patients } = usePatients()
  const { downloadPrescriptionsPdf, downloadHistoryPdf } = useClinic()
  const patient = patients.find((p) => p.id === id)
  const [activeTab, setActiveTab] = useState<TabId>('timeline')

  const [data, setData] = useState<PatientClinicalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<'prescriptions' | 'history' | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function handleDownload(kind: 'prescriptions' | 'history') {
    if (!id) return
    setDownloading(kind)
    setDownloadError(null)
    try {
      await (kind === 'prescriptions' ? downloadPrescriptionsPdf(id) : downloadHistoryPdf(id))
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to generate the document')
    } finally {
      setDownloading(null)
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

  const age = calculateAge(patient.dob)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-[12px] font-medium uppercase tracking-wider text-accent">Admin · Patients</p>
            <h1>{patient.name}</h1>
            <p className="text-ink-soft">
              <span className="font-mono">{formatPatientId(patient.patientNumber)}</span> · {age === null ? '—' : `${age} yrs`} · {patient.phone}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Button variant="secondary" onClick={() => handleDownload('prescriptions')} disabled={downloading !== null}>
              <FileText size={15} className="mr-1.5 inline" />
              {downloading === 'prescriptions' ? 'Generating…' : 'Prescriptions PDF'}
            </Button>
            <Button variant="secondary" onClick={() => handleDownload('history')} disabled={downloading !== null}>
              <FileText size={15} className="mr-1.5 inline" />
              {downloading === 'history' ? 'Generating…' : 'Full History PDF'}
            </Button>
          </div>
        </div>

        {downloadError && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{downloadError}</p>}

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

      <div className="flex gap-1 border-b border-rule">
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
  )
}