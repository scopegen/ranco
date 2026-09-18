import { useState, type SubmitEvent } from 'react'
import { useClinic, today } from '../../../state/ClinicContext'
import { Field } from '../../../components/Field'
import { Button } from '../../../components/Button'
import { Pill } from '../../../components/Pill'
import { formatDateTime } from '../../../lib/date'
import type { Patient } from '../../../state/PatientsContext'
import type { PatientClinicalData } from '../PatientDetail'

// Any staff can schedule or complete a next call — not admin-only, same
// access as logging a visit or adding a consultation.
export function NextCallTab({
  patient,
  data,
  onChange,
}: {
  patient: Patient
  data: PatientClinicalData
  onChange: () => void
}) {
  const { addNextCall, completeNextCall } = useClinic()
  const [date, setDate] = useState(today())
  const [time, setTime] = useState('10:00')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  // A history, not just the current one — every entry ever scheduled for
  // this patient, most-recently-scheduled first.
  const sorted = [...data.nextCalls].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      // date/time inputs are plain local values with no timezone info —
      // `new Date` on a bare "YYYY-MM-DDTHH:mm:00" string reads it as local
      // time (IST for this clinic), which is exactly what was picked.
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString()
      await addNextCall(patient.id, { scheduledAt })
      setTime('10:00')
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule the next call')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleComplete(id: string) {
    setCompletingId(id)
    try {
      await completeNextCall(id)
      onChange()
    } finally {
      setCompletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-rule bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" type="date" required min={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          <Field label="Time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Scheduling…' : '+ Schedule next call'}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {sorted.map((nc) => (
          <div
            key={nc.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-body font-medium text-ink">{formatDateTime(nc.scheduledAt)}</span>
              <span className="text-[12px] text-ink-faint">
                Added {formatDateTime(nc.createdAt)}
                {nc.completedAt && ` · Done ${formatDateTime(nc.completedAt)}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Pill variant={nc.status === 'upcoming' ? 'warning' : 'success'}>
                {nc.status === 'upcoming' ? 'Upcoming' : 'Done'}
              </Pill>
              {nc.status === 'upcoming' && (
                <Button variant="secondary" onClick={() => handleComplete(nc.id)} disabled={completingId === nc.id}>
                  {completingId === nc.id ? 'Marking…' : 'Mark as Done'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
