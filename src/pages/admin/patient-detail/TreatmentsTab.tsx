import { useState, type SubmitEvent } from 'react'
import { CalendarPlus, CheckCircle2, Trash2 } from 'lucide-react'
import { Pill } from '../../../components/Pill'
import { Button } from '../../../components/Button'
import { Field, SelectField } from '../../../components/Field'
import type { Patient } from '../../../state/PatientsContext'
import { useClinic, today } from '../../../state/ClinicContext'
import { formatDate } from '../../../lib/date'
import { formatRx } from '../../../lib/rx'
import type { PrescriptionEntry, RxItem, Treatment, Visit } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'
import { CategorizedServicePicker, PrescriptionBlock, RxRowsField } from './ConsultationsTab'

interface Props {
  patient: Patient
  data: PatientClinicalData
  onChange: () => void
}

export function TreatmentsTab({ patient, data, onChange }: Props) {
  // Most actionable first: ongoing treatments (log a visit / end it), then
  // ones added but not yet started, then finished ones last — those are
  // just the historical record.
  const ongoingTreatments = data.treatments.filter((t) => t.status === 'ongoing')
  const pendingTreatments = data.treatments.filter((t) => t.status === 'pending')
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
      <AddTreatmentSection patient={patient} onChange={onChange} />

      {data.treatments.length === 0 && (
        <p className="text-ink-soft">No treatments yet — add one above to get started.</p>
      )}

      {ongoingTreatments.map(renderTreatmentCard)}
      {pendingTreatments.map((treatment) => (
        <PendingTreatmentCard key={treatment.id} treatment={treatment} onChange={onChange} />
      ))}
      {finishedTreatments.map(renderTreatmentCard)}
    </div>
  )
}

function AddTreatmentSection({ patient, onChange }: { patient: Patient; onChange: () => void }) {
  const { doctors, services, addTreatment } = useClinic()
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serviceId, setServiceId] = useState('')
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await addTreatment(patient.id, { serviceId, doctorId })
      setServiceId('')
      setFormOpen(false)
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the treatment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant={formOpen ? 'ghost' : 'primary'} onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ Add treatment'}
        </Button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-dashed border-accent bg-accent-tint p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-lg bg-white p-4">
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
            <Button type="submit" disabled={submitting || !serviceId}>
              {submitting ? 'Adding…' : 'Add treatment'}
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

function PendingTreatmentCard({ treatment, onChange }: { treatment: Treatment; onChange: () => void }) {
  const { doctorName, serviceName, startTreatment, deleteTreatment } = useClinic()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleStart() {
    setStarting(true)
    setStartError(null)
    try {
      await startTreatment(treatment.id, { startedAt: today() })
      onChange()
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start treatment')
      setStarting(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete this ${serviceName(treatment.serviceId)} treatment? This can't be undone.`)) return
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
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-accent bg-accent-tint p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-subheading font-medium text-ink">{serviceName(treatment.serviceId)}</p>
          <p className="text-[12px] text-ink-faint">{doctorName(treatment.doctorId)}</p>
        </div>
        <Pill variant="warning">Pending</Pill>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={handleStart} disabled={starting}>
          {starting ? 'Starting…' : 'Start treatment'}
        </Button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete treatment"
          title="Delete treatment"
          className="flex items-center justify-center rounded-lg bg-white p-2.5 text-ink-soft transition-colors hover:bg-crit-soft hover:text-crit disabled:opacity-50"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {startError && <p className="text-[13px] text-crit">{startError}</p>}
      {deleteError && <p className="text-[13px] text-crit">{deleteError}</p>}
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
          {/* Only pending treatments (rendered separately, as PendingTreatmentCard) ever have a null startedAt */}
          started {formatDate(treatment.startedAt!)}
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