import { useState, type SubmitEvent } from 'react'
import { CalendarPlus, CheckCircle2, Trash2 } from 'lucide-react'
import { Pill } from '../../../components/Pill'
import { Button } from '../../../components/Button'
import { Field, SelectField } from '../../../components/Field'
import type { Patient } from '../../../state/PatientsContext'
import { useClinic, today } from '../../../state/ClinicContext'
import { formatDate } from '../../../lib/date'
import { formatRx } from '../../../lib/rx'
import type { Consultation, PrescriptionEntry, RxItem, Treatment, Visit } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'
import { CategorizedServicePicker, PrescriptionBlock, RxRowsField } from './ConsultationsTab'

interface Props {
  patient: Patient
  data: PatientClinicalData
  onChange: () => void
}

interface PendingItem {
  consultation: Consultation
  // The specific recommended service this prompt is for — a consultation
  // that recommended nothing doesn't get a prompt at all (there'd be
  // nothing to start), so this is always a real service now.
  serviceId: string
}

export function TreatmentsTab({ patient, data, onChange }: Props) {
  // A consultation with a recommended service moves here, as an actionable
  // "start treatment" prompt, the moment it's saved — the doctor no longer
  // starts a treatment from inside the consultation itself. A consultation
  // can recommend several services; each one that doesn't have a treatment
  // yet gets its own prompt, independent of the others, so starting one
  // doesn't hide the rest. A consultation that recommended nothing just
  // doesn't show up here.
  const pendingItems: PendingItem[] = []
  for (const consultation of data.consultations) {
    const startedServiceIds = new Set(
      data.treatments.filter((t) => t.consultationId === consultation.id).map((t) => t.serviceId),
    )
    for (const serviceId of consultation.recommendedServiceIds) {
      if (!startedServiceIds.has(serviceId)) {
        pendingItems.push({ consultation, serviceId })
      }
    }
  }
  pendingItems.sort((a, b) => b.consultation.consultDate.localeCompare(a.consultation.consultDate))

  if (data.treatments.length === 0 && pendingItems.length === 0) {
    return <p className="text-ink-soft">No consultations yet — add one from the Consultations tab.</p>
  }

  // Most actionable first: ongoing treatments (log a visit / end it), then
  // consultations awaiting a treatment to start, then finished ones last —
  // those are just the historical record.
  const ongoingTreatments = data.treatments.filter((t) => t.status === 'ongoing')
  const finishedTreatments = data.treatments.filter((t) => t.status === 'finished')

  function renderTreatmentCard(treatment: Treatment) {
    return (
      <TreatmentCard
        key={treatment.id}
        patient={patient}
        treatment={treatment}
        visits={data.visitsByTreatment[treatment.id] ?? []}
        prescriptions={data.prescriptions}
        onChange={onChange}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {ongoingTreatments.map(renderTreatmentCard)}
      {pendingItems.map((item) => (
        <StartTreatmentCard
          key={`${item.consultation.id}-${item.serviceId}`}
          consultation={item.consultation}
          recommendedServiceId={item.serviceId}
          onChange={onChange}
        />
      ))}
      {finishedTreatments.map(renderTreatmentCard)}
    </div>
  )
}

function StartTreatmentCard({
  consultation,
  recommendedServiceId,
  onChange,
}: {
  consultation: Consultation
  recommendedServiceId: string
  onChange: () => void
}) {
  const { doctors, services, doctorName, serviceName, startTreatment, updateConsultation } = useClinic()
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serviceId, setServiceId] = useState(recommendedServiceId)
  const [doctorId, setDoctorId] = useState(consultation.doctorId ?? doctors[0]?.id)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await startTreatment(consultation.id, { serviceId, doctorId, startedAt: today() })
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start treatment')
    } finally {
      setSubmitting(false)
    }
  }

  // Drops this service from the consultation's recommended list — same
  // "full replace" pattern the edit-consultation form already uses.
  async function handleRemove() {
    if (!window.confirm(`Remove "${serviceName(recommendedServiceId)}" from this consultation's recommended treatments?`)) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await updateConsultation(consultation.patientId, consultation.id, {
        doctorId: consultation.doctorId,
        consultDate: consultation.consultDate,
        fee: consultation.fee,
        chiefComplaint: consultation.chiefComplaint,
        oralExamination: consultation.oralExamination,
        rx: consultation.rx,
        paymentStatus: consultation.paymentStatus,
        paymentMode: consultation.paymentMode,
        recommendedServiceIds: consultation.recommendedServiceIds.filter((id) => id !== recommendedServiceId),
        recommendationNote: consultation.recommendationNote,
      })
      onChange()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove the recommendation')
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-accent bg-accent-tint p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-subheading font-medium text-ink">{serviceName(recommendedServiceId)}</p>
          <p className="text-[12px] text-ink-faint">
            {doctorName(consultation.doctorId)} &middot; consulted {formatDate(consultation.consultDate)}
          </p>
          {consultation.recommendationNote && (
            <p className="mt-1 text-[12px] italic text-ink-soft">&ldquo;{consultation.recommendationNote}&rdquo;</p>
          )}
        </div>
        <Pill variant="warning">Pending</Pill>
      </div>

      {!formOpen && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setFormOpen(true)}>
            Start treatment
          </Button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            aria-label="Remove recommended treatment"
            title="Remove recommended treatment"
            className="flex items-center justify-center rounded-lg bg-white p-2.5 text-ink-soft transition-colors hover:bg-crit-soft hover:text-crit disabled:opacity-50"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {removeError && <p className="text-[13px] text-crit">{removeError}</p>}

      {formOpen && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-white p-4">
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
          {error && <p className="text-[13px] text-crit">{error}</p>}
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
  )
}

function TreatmentCard({
  patient,
  treatment,
  visits,
  prescriptions,
  onChange,
}: {
  patient: Patient
  treatment: Treatment
  visits: Visit[]
  prescriptions: PrescriptionEntry[]
  onChange: () => void
}) {
  const { doctorName, serviceName, logVisit, addPrescription, endTreatment, deleteTreatment } = useClinic()
  const [visitFormOpen, setVisitFormOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const serviceLabel = serviceName(treatment.serviceId)
  // Only safe to delete before the patient has actually come in for it —
  // once a visit is logged the treatment is "started" and stays a record.
  const canDelete = treatment.status === 'ongoing' && visits.length === 0

  async function handleEnd() {
    setEnding(true)
    setEndError(null)
    try {
      await endTreatment(treatment.id)
      onChange()
    } catch (err) {
      setEndError(err instanceof Error ? err.message : 'Failed to end the treatment')
    } finally {
      setEnding(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete this ${serviceLabel} treatment? This can't be undone.`)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteTreatment(treatment.id)
      onChange()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the treatment')
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-subheading font-medium text-ink">{serviceLabel}</p>
        {treatment.status === 'finished' ? (
          <Pill variant="solid">Finished</Pill>
        ) : (
          <Pill variant="success">Ongoing</Pill>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-ink-faint">
          started {formatDate(treatment.startedAt)}
          {treatment.completedAt && ` · finished ${formatDate(treatment.completedAt)}`}
        </p>
        {treatment.status === 'ongoing' && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVisitFormOpen(true)}
              aria-label="Log visit"
              title="Log visit"
              className="flex items-center justify-center rounded-[20px] bg-paper-raised p-1.5 text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-deep"
            >
              <CalendarPlus size={15} />
            </button>
            <button
              type="button"
              onClick={handleEnd}
              disabled={ending}
              aria-label="End treatment"
              title="End treatment"
              className="flex items-center justify-center rounded-[20px] bg-paper-raised p-1.5 text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-deep disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Delete treatment"
                title="Delete treatment"
                className="flex items-center justify-center rounded-[20px] bg-paper-raised p-1.5 text-ink-soft transition-colors hover:bg-crit-soft hover:text-crit disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t border-rule pt-4">
        <p className="text-[12px] text-ink-faint">{doctorName(treatment.doctorId)}</p>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Visits ({visits.length})</p>
          {visits.length === 0 && <p className="text-[13px] text-ink-faint">No visits logged yet.</p>}
          {/* Visits are an activity log only now — no per-visit price or
              payment status. The treatment as a whole is billed once, on
              the Billing tab. */}
          {visits.map((visit) => (
            <div key={visit.id} className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink-soft">{formatDate(visit.visitDate)}</span>
              <PrescriptionBlock prescription={prescriptions.find((p) => p.visitId === visit.id)} />
            </div>
          ))}
        </div>

        {treatment.status === 'ongoing' && (
          <div className="flex flex-col gap-4 border-t border-rule pt-4">
            {!visitFormOpen && (
              <div className="flex flex-wrap items-center justify-end gap-3">
                {canDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    aria-label="Delete treatment"
                    title="Delete treatment"
                    className="flex items-center justify-center rounded-lg bg-paper-raised p-2.5 text-ink-soft transition-colors hover:bg-crit-soft hover:text-crit disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <Button variant="secondary" onClick={() => setVisitFormOpen(true)}>
                  + Log visit
                </Button>
                <Button variant="secondary" onClick={handleEnd} disabled={ending}>
                  {ending ? 'Ending…' : 'End treatment'}
                </Button>
              </div>
            )}
            {endError && <p className="text-[13px] text-crit">{endError}</p>}
            {deleteError && <p className="text-[13px] text-crit">{deleteError}</p>}

            {visitFormOpen && (
              <LogVisitForm
                onSubmit={async (input) => {
                  const visit = await logVisit(treatment.id, { visitDate: input.visitDate })
                  if (input.prescription) {
                    await addPrescription({
                      patientId: patient.id,
                      visitId: visit.id,
                      diagnosis: input.prescription.diagnosis,
                      notes: input.prescription.notes,
                      advice: input.prescription.advice,
                      nextVisit: input.prescription.nextVisit,
                    })
                  }
                  setVisitFormOpen(false)
                  onChange()
                }}
                onCancel={() => setVisitFormOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface PrescriptionInput {
  diagnosis?: string
  notes: string
  advice?: string
  nextVisit?: string
}

function LogVisitForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: { visitDate: string; prescription?: PrescriptionInput }) => Promise<void>
  onCancel: () => void
}) {
  const [visitDate, setVisitDate] = useState(today())
  const [submitting, setSubmitting] = useState(false)

  const [addRx, setAddRx] = useState(false)
  const [diagnosis, setDiagnosis] = useState('')
  const [rx, setRx] = useState<RxItem[]>([])
  const [advice, setAdvice] = useState('')
  const [nextVisit, setNextVisit] = useState('')

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      // No price/payment info collected here at all — billing happens
      // separately, on its own track. The amount is derived automatically
      // from the treatment's service by the caller. A medicine isn't
      // required — a visit can be logged with just advice/next-visit notes
      // and no new prescription-worthy medicine.
      await onSubmit({
        visitDate,
        prescription: addRx
          ? {
              diagnosis: diagnosis || undefined,
              notes: formatRx(rx),
              advice: advice || undefined,
              nextVisit: nextVisit || undefined,
            }
          : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-paper-raised p-4">
      <Field label="Visit date" required type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} max={today()} />
      <label className="flex items-center gap-2 border-t border-rule pt-4 text-body text-ink">
        <input type="checkbox" checked={addRx} onChange={(e) => setAddRx(e.target.checked)} className="h-4 w-4 accent-accent" />
        Add a prescription for this visit
      </label>

      {addRx && (
        <div className="flex flex-col gap-4 rounded-lg bg-white p-4">
          <Field label="Diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          <RxRowsField value={rx} onChange={setRx} />
          <Field label="Advice" value={advice} onChange={(e) => setAdvice(e.target.value)} />
          <Field label="Next visit" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Log visit'}
        </Button>
      </div>
    </form>
  )
}