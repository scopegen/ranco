import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react'
import { ChevronDown, Eye } from 'lucide-react'
import type { Patient } from '../../../state/PatientsContext'
import { useClinic, today } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { formatDate, formatDateTime } from '../../../lib/date'
import { Button } from '../../../components/Button'
import { Field, SelectField, TextareaField } from '../../../components/Field'
import { CONSULTATION_FEE, type Consultation, type PaymentMode, type Service, type Treatment } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'

const UNCATEGORIZED = 'General'

/** Dropdown that groups services by category — click a category to expand
 * it and reveal its services, rather than one long flat list. */
function CategorizedServicePicker({
  label,
  services,
  value,
  onChange,
  required,
}: {
  label: string
  services: Service[]
  value: string
  onChange: (id: string) => void
  required?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const selected = services.find((s) => s.id === value)

  const grouped = useMemo(() => {
    const groups = new Map<string, Service[]>()
    for (const s of services.filter((s) => s.active)) {
      const key = s.category ?? UNCATEGORIZED
      groups.set(key, [...(groups.get(key) ?? []), s])
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1
      if (b === UNCATEGORIZED) return -1
      return a.localeCompare(b)
    })
  }, [services])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleOpen() {
    setExpanded(selected?.category ?? null)
    setOpen(true)
  }

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5">
      <span className="text-body font-medium text-ink">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="flex items-center justify-between rounded-lg border border-rule bg-white px-3.5 py-2.5 text-left text-body text-ink outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint"
      >
        <span>{selected ? selected.name : 'Select…'}</span>
        <ChevronDown size={16} className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full z-10 mt-1 max-h-80 w-full min-w-[240px] overflow-y-auto rounded-lg border border-rule bg-white shadow-lg">
          {grouped.map(([category, groupServices]) => (
            <div key={category}>
              <button
                type="button"
                onClick={() => setExpanded((prev) => (prev === category ? null : category))}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-body font-medium text-ink transition-colors hover:bg-paper-raised"
              >
                {category}
                <ChevronDown
                  size={14}
                  className={`text-ink-faint transition-transform ${expanded === category ? 'rotate-180' : ''}`}
                />
              </button>
              {expanded === category && (
                <div className="flex flex-col bg-paper-raised">
                  {groupServices.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onChange(s.id)
                        setOpen(false)
                      }}
                      className={`px-6 py-2 text-left text-[13px] transition-colors hover:bg-accent-tint ${
                        s.id === value ? 'font-medium text-accent-deep' : 'text-ink-soft'
                      }`}
                    >
                      {s.name} <span className="text-ink-faint">— {formatINR(s.listedPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
  services: Service[]
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
        <CategorizedServicePicker
          label="Recommended treatment"
          required
          services={services}
          value={recommendedServiceId}
          onChange={setRecommendedServiceId}
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
  const { doctors, services, doctorName, startTreatment } = useClinic()
  const [formOpen, setFormOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
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
        <p className="text-subheading font-medium text-ink">{doctorName(consultation.doctorId)}</p>
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-ink-faint">{formatDate(consultation.consultDate)}</p>
          <button
            type="button"
            onClick={() => setEditOpen((v) => !v)}
            aria-label="View / edit consultation"
            title="View / edit"
            className={`flex items-center justify-center rounded-[20px] bg-paper-raised p-1.5 transition-colors ${
              editOpen ? 'bg-accent-tint text-accent-deep' : 'text-ink-soft hover:bg-accent-tint hover:text-accent-deep'
            }`}
          >
            <Eye size={15} />
          </button>
        </div>
      </div>

      {editOpen && (
        <>
          <EditConsultationForm
            consultation={consultation}
            doctors={doctors}
            services={services}
            onSaved={() => {
              setEditOpen(false)
              onChange()
            }}
            onCancel={() => setEditOpen(false)}
          />

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
                    <CategorizedServicePicker label="Service" required services={services} value={serviceId} onChange={setServiceId} />
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
        </>
      )}
    </div>
  )
}

function EditConsultationForm({
  consultation,
  doctors,
  services,
  onSaved,
  onCancel,
}: {
  consultation: Consultation
  doctors: { id: string; name: string }[]
  services: Service[]
  onSaved: () => void
  onCancel: () => void
}) {
  const { updateConsultation } = useClinic()
  const [doctorId, setDoctorId] = useState(consultation.doctorId)
  const [consultDate, setConsultDate] = useState(consultation.consultDate)
  const [findings, setFindings] = useState(consultation.findings)
  const [recommendedServiceId, setRecommendedServiceId] = useState(consultation.recommendedServiceId ?? services[0]?.id)
  const [fee, setFee] = useState(String(consultation.fee))
  const [paid, setPaid] = useState(consultation.paymentStatus === 'paid')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(consultation.paymentMode ?? 'cash')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await updateConsultation(consultation.patientId, consultation.id, {
        doctorId,
        consultDate,
        fee: Number(fee),
        findings,
        paymentStatus: paid ? 'paid' : 'unpaid',
        paymentMode: paid ? paymentMode : undefined,
        recommendedServiceId,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-rule pt-4">
      <p className="text-[12px] text-ink-faint">Last updated: {formatDateTime(consultation.updatedAt)}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Consulting doctor"
          required
          options={doctors.map((d) => d.name)}
          value={doctors.find((d) => d.id === doctorId)?.name}
          onChange={(e) => setDoctorId(doctors.find((d) => d.name === e.target.value)!.id)}
        />
        <Field label="Consultation date" required type="date" value={consultDate} onChange={(e) => setConsultDate(e.target.value)} max={today()} />
      </div>

      <CategorizedServicePicker
        label="Recommended treatment"
        required
        services={services}
        value={recommendedServiceId}
        onChange={setRecommendedServiceId}
      />

      <TextareaField label="Findings" required value={findings} onChange={(e) => setFindings(e.target.value)} />

      <div className="flex flex-wrap items-end gap-5 border-t border-rule pt-4">
        <Field label="Fee" required type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} className="w-32" />
        <label className="flex items-center gap-2 text-body text-ink">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-accent" />
          Paid
        </label>
        {paid && (
          <SelectField
            label="Payment mode"
            options={['cash', 'card', 'upi']}
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            className="w-40"
          />
        )}
      </div>

      {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}