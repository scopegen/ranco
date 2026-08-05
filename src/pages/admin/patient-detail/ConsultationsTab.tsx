import { useState, type SubmitEvent } from 'react'
import type { Patient } from '../../../state/PatientsContext'
import { useClinic, today } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { formatDate } from '../../../lib/date'
import { PaymentStatusPill } from '../../../components/PaymentStatusPill'
import { Button } from '../../../components/Button'
import { SelectField, TextareaField } from '../../../components/Field'
import { CONSULTATION_FEE, type Consultation, type PaymentMode, type Treatment } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'

interface Props {
  patient: Patient
  data: PatientClinicalData
  onChange: () => void
}

export function ConsultationsTab({ patient, data, onChange }: Props) {
  const { doctors, services, addConsultation, addPrescription } = useClinic()
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd(input: {
    doctorId: string
    findings: string
    recommendedServiceId: string
    prescriptionNote?: string
    paymentStatus: 'paid' | 'unpaid'
    paymentMode?: PaymentMode
  }) {
    setSubmitting(true)
    try {
      const consultation = await addConsultation(patient.id, {
        doctorId: input.doctorId,
        consultDate: today(),
        fee: CONSULTATION_FEE,
        findings: input.findings,
        paymentStatus: input.paymentStatus,
        paymentMode: input.paymentMode,
        recommendedServiceId: input.recommendedServiceId,
      })
      if (input.prescriptionNote) {
        await addPrescription({ patientId: patient.id, consultationId: consultation.id, notes: input.prescriptionNote })
      }
      setFormOpen(false)
      onChange()
    } finally {
      setSubmitting(false)
    }
  }

  if (doctors.length === 0 || services.length === 0) {
    return <p className="text-ink-soft">Loading doctors/services…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant={formOpen ? 'ghost' : 'primary'} onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ New consultation'}
        </Button>
      </div>

      {formOpen && <NewConsultationForm doctors={doctors} services={services} onSubmit={handleAdd} submitting={submitting} />}

      {data.consultations.length === 0 && !formOpen && <p className="text-ink-soft">No consultations yet.</p>}

      {data.consultations.map((consultation) => (
        <ConsultationCard
          key={consultation.id}
          consultation={consultation}
          treatment={data.treatments.find((t) => t.consultationId === consultation.id)}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

function NewConsultationForm({
  doctors,
  services,
  onSubmit,
  submitting,
}: {
  doctors: { id: string; name: string }[]
  services: { id: string; name: string }[]
  onSubmit: (input: {
    doctorId: string
    findings: string
    recommendedServiceId: string
    prescriptionNote?: string
    paymentStatus: 'paid' | 'unpaid'
    paymentMode?: PaymentMode
  }) => void
  submitting: boolean
}) {
  const [doctorId, setDoctorId] = useState(doctors[0].id)
  const [findings, setFindings] = useState('')
  const [recommendedServiceId, setRecommendedServiceId] = useState(services[0].id)
  const [prescriptionNote, setPrescriptionNote] = useState('')
  const [paidNow, setPaidNow] = useState(true)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    onSubmit({
      doctorId,
      findings,
      recommendedServiceId,
      prescriptionNote: prescriptionNote || undefined,
      paymentStatus: paidNow ? 'paid' : 'unpaid',
      paymentMode: paidNow ? paymentMode : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SelectField
          label="Consulting doctor"
          required
          options={doctors.map((d) => d.name)}
          value={doctors.find((d) => d.id === doctorId)?.name}
          onChange={(e) => setDoctorId(doctors.find((d) => d.name === e.target.value)!.id)}
        />
        <SelectField
          label="Recommended treatment"
          required
          options={services.map((s) => s.name)}
          value={services.find((s) => s.id === recommendedServiceId)?.name}
          onChange={(e) => setRecommendedServiceId(services.find((s) => s.name === e.target.value)!.id)}
        />
      </div>

      <TextareaField label="Findings" required value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="What the exam found" />

      <TextareaField
        label="Prescription"
        hint="optional"
        value={prescriptionNote}
        onChange={(e) => setPrescriptionNote(e.target.value)}
        placeholder="e.g. Ibuprofen 400mg, as needed for pain"
      />

      <div className="flex flex-wrap items-end gap-5 border-t border-rule pt-4">
        <label className="flex items-center gap-2 text-body text-ink">
          <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} className="h-4 w-4 accent-accent" />
          Consultation fee ({formatINR(CONSULTATION_FEE)}) paid now
        </label>
        {paidNow && (
          <SelectField
            label="Payment mode"
            options={['cash', 'card', 'upi']}
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            className="w-40"
          />
        )}
      </div>

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save consultation'}
        </Button>
      </div>
    </form>
  )
}

function ConsultationCard({
  consultation,
  treatment,
  onChange,
}: {
  consultation: Consultation
  treatment: Treatment | undefined
  onChange: () => void
}) {
  const { doctors, services, doctorName, serviceName, startTreatment } = useClinic()
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serviceId, setServiceId] = useState(consultation.recommendedServiceId ?? services[0]?.id)
  const [doctorId, setDoctorId] = useState(doctors[0]?.id)

  async function handleStart(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await startTreatment(consultation.id, { serviceId, doctorId, startedAt: today() })
      setFormOpen(false)
      onChange()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-subheading font-medium text-ink">{doctorName(consultation.doctorId)}</p>
          <p className="text-[12px] text-ink-faint">{formatDate(consultation.consultDate)}</p>
        </div>
        <PaymentStatusPill status={consultation.paymentStatus} />
      </div>

      <p className="text-ink-soft">{consultation.findings}</p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-rule pt-3 text-[13px]">
        <span className="text-ink-soft">
          Recommended: <span className="font-medium text-ink">{serviceName(consultation.recommendedServiceId)}</span>
        </span>
        <span className="text-ink-soft">
          Fee: <span className="font-medium text-ink">{formatINR(consultation.fee)}</span>
          {consultation.paymentMode && ` · ${consultation.paymentMode.toUpperCase()}`}
        </span>
      </div>

      {treatment ? (
        <p className="border-t border-rule pt-3 text-[13px] text-ink-soft">
          Treatment started — see <span className="font-medium text-ink">Treatments</span> tab.
        </p>
      ) : (
        <div className="border-t border-rule pt-3">
          {!formOpen && (
            <Button variant="secondary" onClick={() => setFormOpen(true)}>
              Start treatment
            </Button>
          )}
          {formOpen && (
            <form onSubmit={handleStart} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Service"
                  required
                  options={services.map((s) => s.name)}
                  value={services.find((s) => s.id === serviceId)?.name}
                  onChange={(e) => setServiceId(services.find((s) => s.name === e.target.value)!.id)}
                />
                <SelectField
                  label="Assigned doctor"
                  required
                  options={doctors.map((d) => d.name)}
                  value={doctors.find((d) => d.id === doctorId)?.name}
                  onChange={(e) => setDoctorId(doctors.find((d) => d.name === e.target.value)!.id)}
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Starting…' : 'Start treatment'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}