import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import type { Patient } from '../../../state/PatientsContext'
import { useClinic, today } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { formatDate, formatDateTime } from '../../../lib/date'
import { Button } from '../../../components/Button'
import { Field, SelectField, TextareaField } from '../../../components/Field'
import { CONSULTATION_FEE, RX_FREQUENCIES, type Consultation, type RxItem, type Service, type Treatment } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'

const UNCATEGORIZED = 'General'

/** Dropdown that groups services by category — click a category to expand
 * it and reveal its services, rather than one long flat list. */
export function CategorizedServicePicker({
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

/** A doctor can recommend more than one catalog service for the same
 * consultation — pick one at a time from the dropdown and add it to the
 * list; each added service shows as a removable chip below. */
function RecommendedServicesPicker({
  services,
  value,
  onChange,
}: {
  services: Service[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const [pickerValue, setPickerValue] = useState(services[0]?.id ?? '')

  function handleAdd() {
    if (!pickerValue || value.includes(pickerValue)) return
    onChange([...value, pickerValue])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <CategorizedServicePicker label="Recommended treatment" services={services} value={pickerValue} onChange={setPickerValue} />
        </div>
        <Button type="button" variant="secondary" onClick={handleAdd}>
          + Add
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const service = services.find((s) => s.id === id)
            return (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-full bg-accent-tint py-1 pl-3 pr-1.5 text-[12px] font-medium text-accent-deep"
              >
                {service?.name ?? 'Unknown service'}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  aria-label={`Remove ${service?.name ?? 'service'}`}
                  className="flex items-center justify-center rounded-full p-0.5 text-accent-deep transition-colors hover:bg-white/60"
                >
                  <X size={12} />
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Repeatable Rx rows — one medicine + a dosing-frequency dropdown per row,
 * each row addable/removable on its own (+ below the rows, X on each row).
 * Free-typed medicine name since the catalog doesn't cover every drug; the
 * frequency is a fixed dropdown since that vocabulary is small and standard. */
export function RxRowsField({ value, onChange }: { value: RxItem[]; onChange: (items: RxItem[]) => void }) {
  function updateRow(index: number, patch: Partial<RxItem>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addRow() {
    onChange([...value, { medicine: '', frequency: RX_FREQUENCIES[0] }])
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-body font-medium text-ink">Rx</span>

      {value.length === 0 && <p className="text-[13px] text-ink-faint">No medicines added yet.</p>}

      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={item.medicine}
            onChange={(e) => updateRow(i, { medicine: e.target.value })}
            placeholder="e.g. Amoxicillin 500mg"
            className="w-full min-w-0 flex-1 rounded-lg border border-rule bg-white px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint"
          />
          <select
            value={item.frequency}
            onChange={(e) => updateRow(i, { frequency: e.target.value })}
            className="w-24 shrink-0 rounded-lg border border-rule bg-white px-2 py-2.5 text-body text-ink outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint"
          >
            {RX_FREQUENCIES.map((freq) => (
              <option key={freq} value={freq}>
                {freq}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => removeRow(i)}
            aria-label="Remove medicine"
            className="flex shrink-0 items-center justify-center rounded-[20px] bg-paper-raised p-2 text-ink-soft transition-colors hover:bg-crit-soft hover:text-crit"
          >
            <X size={15} />
          </button>
        </div>
      ))}

      <div>
        <Button type="button" variant="secondary" onClick={addRow} className="flex items-center gap-1.5">
          <Plus size={14} /> Add medicine
        </Button>
      </div>
    </div>
  )
}

interface Props {
  patient: Patient
  data: PatientClinicalData
  onChange: () => void
  // Set when arriving via an "+ Add consultation" shortcut (overview page,
  // quick-add menu) rather than the Consultations page's own button — skips
  // straight to the form instead of making the doctor click again.
  initialFormOpen?: boolean
}

export function ConsultationsTab({ patient, data, onChange, initialFormOpen = false }: Props) {
  const { doctors, services, addConsultation } = useClinic()
  const [formOpen, setFormOpen] = useState(initialFormOpen)
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd(input: {
    doctorId: string
    chiefComplaint: string
    oralExamination: string
    rx: RxItem[]
    recommendedServiceIds: string[]
    recommendationNote?: string
  }) {
    setSubmitting(true)
    try {
      // Billing (payment status/mode) isn't decided here — doctors log the
      // clinical record, billing is handled separately on its own track.
      // Every consultation starts unpaid; reception settles it later.
      // No prescription here — prescriptions are only ever added once
      // treatment starts, from the Treatments tab.
      await addConsultation(patient.id, {
        doctorId: input.doctorId,
        consultDate: today(),
        fee: CONSULTATION_FEE,
        chiefComplaint: input.chiefComplaint,
        oralExamination: input.oralExamination,
        rx: input.rx,
        paymentStatus: 'unpaid',
        recommendedServiceIds: input.recommendedServiceIds,
        recommendationNote: input.recommendationNote,
      })
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
    chiefComplaint: string
    oralExamination: string
    rx: RxItem[]
    recommendedServiceIds: string[]
    recommendationNote?: string
  }) => void
  submitting: boolean
}) {
  const [doctorId, setDoctorId] = useState(doctors[0].id)
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [oralExamination, setOralExamination] = useState('')
  const [rx, setRx] = useState<RxItem[]>([])
  const [recommendedServiceIds, setRecommendedServiceIds] = useState<string[]>([])
  const [recommendationNote, setRecommendationNote] = useState('')

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    onSubmit({
      doctorId,
      chiefComplaint,
      oralExamination,
      rx: rx.filter((item) => item.medicine.trim() !== ''),
      recommendedServiceIds,
      recommendationNote: recommendationNote || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <SelectField
        label="Consulting doctor"
        required
        options={doctors.map((d) => d.name)}
        value={doctors.find((d) => d.id === doctorId)?.name}
        onChange={(e) => setDoctorId(doctors.find((d) => d.name === e.target.value)!.id)}
      />

      <TextareaField
        label="Chief complaint"
        required
        value={chiefComplaint}
        onChange={(e) => setChiefComplaint(e.target.value)}
        placeholder="e.g. Pain in upper left molar for 3 days"
      />

      <TextareaField
        label="Oral examination"
        required
        value={oralExamination}
        onChange={(e) => setOralExamination(e.target.value)}
        placeholder=""
      />

      <RxRowsField value={rx} onChange={setRx} />

      <RecommendedServicesPicker services={services} value={recommendedServiceIds} onChange={setRecommendedServiceIds} />

      <TextareaField
        label="Additional recommendation"
        value={recommendationNote}
        onChange={(e) => setRecommendationNote(e.target.value)}
        placeholder=""
      />

      <div className="flex justify-end">
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
  const { doctors, services, doctorName } = useClinic()
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-subheading font-medium text-ink">{doctorName(consultation.doctorId)}</p>
          <p className="text-[12px] text-ink-faint">{formatDate(consultation.consultDate)}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditOpen((v) => !v)}
          aria-label={editOpen ? 'Hide consultation details' : 'View consultation details'}
          className={`shrink-0 rounded-md border border-accent px-2.5 py-1 text-[12px] font-medium text-accent-deep transition-colors ${
            editOpen ? 'bg-accent-tint' : 'hover:bg-accent-tint'
          }`}
        >
          {editOpen ? 'Hide' : 'View'}
        </button>
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
            <p className="border-t border-rule pt-3 text-[13px] text-ink-soft">
              No treatment started yet — start one from the <span className="font-medium text-ink">Treatments</span> tab.
            </p>
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
  const [chiefComplaint, setChiefComplaint] = useState(consultation.chiefComplaint)
  const [oralExamination, setOralExamination] = useState(consultation.oralExamination)
  const [rx, setRx] = useState<RxItem[]>(consultation.rx)
  const [recommendedServiceIds, setRecommendedServiceIds] = useState<string[]>(consultation.recommendedServiceIds)
  const [recommendationNote, setRecommendationNote] = useState(consultation.recommendationNote ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      // Billing fields aren't editable here — carried forward unchanged.
      // Payment status/mode live on a separate billing track now.
      await updateConsultation(consultation.patientId, consultation.id, {
        doctorId,
        consultDate,
        fee: consultation.fee,
        chiefComplaint,
        oralExamination,
        rx: rx.filter((item) => item.medicine.trim() !== ''),
        paymentStatus: consultation.paymentStatus,
        paymentMode: consultation.paymentMode,
        recommendedServiceIds,
        recommendationNote: recommendationNote || undefined,
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

      <TextareaField
        label="Chief complaint"
        required
        value={chiefComplaint}
        onChange={(e) => setChiefComplaint(e.target.value)}
        placeholder="e.g. Pain in upper left molar for 3 days"
      />

      <TextareaField label="Oral examination" required value={oralExamination} onChange={(e) => setOralExamination(e.target.value)} />

      <RxRowsField value={rx} onChange={setRx} />

      <RecommendedServicesPicker services={services} value={recommendedServiceIds} onChange={setRecommendedServiceIds} />

      <TextareaField
        label="Additional recommendation"
        value={recommendationNote}
        onChange={(e) => setRecommendationNote(e.target.value)}
        placeholder="e.g. Refer to orthodontist for bite evaluation"
      />

      {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}