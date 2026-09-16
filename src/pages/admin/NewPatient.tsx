import { useEffect, useMemo, useState, type ComponentType, type InputHTMLAttributes, type SubmitEvent, type TextareaHTMLAttributes } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from 'lucide-react'
import { Button } from '../../components/Button'
import { calculateAge } from '../../lib/age'
import { clinicalApi } from '../../lib/clinicalApi'
import { findPatientByCode, formatPatientId } from '../../lib/patientId'
import { usePatients, type Patient } from '../../state/PatientsContext'

type BirthMode = 'dob' | 'age' | 'year'

type Gender = 'male' | 'female' | 'other'

interface PatientDraft {
  name: string
  phone: string
  city: string
  sector: string
  birthMode: BirthMode
  dob: string
  age: string
  birthYear: string
  email: string
  gender: Gender | null
  height: string
  weight: string
  medicalConditions: string[]
  medicalHistory: string
}

const emptyDraft: PatientDraft = {
  name: '',
  phone: '',
  city: '',
  sector: '',
  birthMode: 'dob',
  dob: '',
  age: '',
  birthYear: '',
  email: '',
  gender: null,
  height: '',
  weight: '',
  medicalConditions: [],
  medicalHistory: '',
}

const BIRTH_MODE_OPTIONS: { value: BirthMode; label: string }[] = [
  { value: 'dob', label: 'DOB' },
  { value: 'age', label: 'Age' },
  { value: 'year', label: 'Birth year only' },
]

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

// Noida + Greater Noida + Delhi + 10 nearby NCR areas — city has no fixed
// list requirement beyond this, so anything outside it can still just be
// typed (see FloatingComboField).
const CITY_OPTIONS = [
  'Noida',
  'Greater Noida',
  'Greater Noida West',
  'Delhi',
  'Ghaziabad',
  'Gurugram',
  'Faridabad',
  'Indirapuram',
  'Vaishali',
  'Vasundhara',
  'Sahibabad',
  'Kaushambi',
  'Loni',
]

function toDraft(patient: Patient): PatientDraft {
  return {
    name: patient.name,
    phone: patient.phone,
    city: patient.city,
    sector: patient.sector,
    // The stored record only ever has dob OR birthYear, never both — if it's
    // birthYear, we show it as "Birth year only" rather than guessing it was
    // originally entered as an age (that detail isn't preserved in storage).
    birthMode: patient.dob ? 'dob' : 'year',
    dob: patient.dob ?? '',
    age: '',
    birthYear: patient.birthYear ? String(patient.birthYear) : '',
    email: patient.email,
    gender: patient.gender,
    height: patient.height,
    weight: patient.weight,
    medicalConditions: patient.medicalConditions,
    medicalHistory: patient.medicalHistory,
  }
}

export function NewPatient() {
  const { code } = useParams<{ code: string }>()
  const isEditing = Boolean(code)

  const [draft, setDraft] = useState<PatientDraft>(emptyDraft)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conditionOptions, setConditionOptions] = useState<string[]>([])
  const [sectorOptions, setSectorOptions] = useState<string[]>([])
  const [showPhysicalDetails, setShowPhysicalDetails] = useState(false)
  const [showMedicalDetails, setShowMedicalDetails] = useState(false)
  const { patients, loading: patientsLoading, addPatient, editPatient } = usePatients()
  const navigate = useNavigate()

  const editingPatient = code ? findPatientByCode(patients, code) : undefined
  // The patients list (loaded once for the whole /admin section) is the only
  // source here now — the route is keyed by the human-readable code, not the
  // internal id, so there's no per-id endpoint left to fall back on.
  const loadingPatient = isEditing && patientsLoading && !editingPatient

  useEffect(() => {
    clinicalApi.listMedicalConditions().then(setConditionOptions)
    // Sector has no fixed list (unlike city) — this grows from whatever
    // staff have actually typed in before, same "pick or type" combo.
    clinicalApi.listSectors().then(setSectorOptions)
  }, [])

  useEffect(() => {
    if (editingPatient) {
      // Pre-existing fetch-on-mount/param-change pattern used the same way
      // throughout the app (Dashboard, PatientList, PatientDetail, …).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(toDraft(editingPatient))
      // Don't hide data the patient already has on file behind an extra
      // click — only new/blank entries start collapsed.
      if (editingPatient.height || editingPatient.weight) {
        setShowPhysicalDetails(true)
      }
      if (editingPatient.medicalConditions.length > 0 || editingPatient.medicalHistory) {
        setShowMedicalDetails(true)
      }
    }
  }, [editingPatient])

  const age = useMemo(() => {
    if (draft.birthMode === 'dob') return calculateAge(draft.dob)
    if (draft.birthMode === 'age') return draft.age ? Number(draft.age) : null
    return calculateAge(null, draft.birthYear ? Number(draft.birthYear) : null)
  }, [draft.birthMode, draft.dob, draft.age, draft.birthYear])

  function update<K extends keyof PatientDraft>(key: K, value: PatientDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function buildPayload(): Omit<Patient, 'id' | 'patientNumber' | 'registeredAt'> {
    // Only one of dob/birthYear goes to the backend, matching whichever
    // mode was selected — age itself is never sent, it's converted to a
    // birth year here first.
    let dob: string | null = null
    let birthYear: number | null = null
    if (draft.birthMode === 'dob') {
      dob = draft.dob
    } else if (draft.birthMode === 'age') {
      birthYear = new Date().getFullYear() - Number(draft.age)
    } else {
      birthYear = Number(draft.birthYear)
    }
    return {
      name: draft.name,
      phone: draft.phone,
      city: draft.city,
      sector: draft.sector,
      dob,
      birthYear,
      email: draft.email,
      gender: draft.gender,
      height: draft.height,
      weight: draft.weight,
      medicalConditions: draft.medicalConditions,
      medicalHistory: draft.medicalHistory,
    }
  }

  function toggleCondition(condition: string) {
    setDraft((prev) => ({
      ...prev,
      medicalConditions: prev.medicalConditions.includes(condition)
        ? prev.medicalConditions.filter((c) => c !== condition)
        : [...prev.medicalConditions, condition],
    }))
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (isEditing && editingPatient) {
        const updated = await editPatient(editingPatient.id, buildPayload())
        navigate(`/admin/patients/${formatPatientId(updated.patientNumber)}`, { state: { justUpdated: updated.name } })
      } else {
        const added = await addPatient(buildPayload())
        navigate('/admin/patients', { state: { justAdded: added.name } })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'add'} patient`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingPatient) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <p className="text-ink-soft">Loading patient…</p>
      </div>
    )
  }

  if (isEditing && !editingPatient) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-16 text-center">
        <h1>Patient not found</h1>
      </div>
    )
  }

  return (
    // Same gradient + wave language as the patient-detail hero card, spread
    // across the whole page instead of one card — no bordered "form panel"
    // anymore, fields sit directly on this background.
    <div className="relative">
      {/* Fixed to the viewport, not part of the scrolling content — stays
          put at the bottom of the screen while only the form (below)
          scrolls over it, instead of scrolling away with the page. No
          z-index here (was -z-10, which sank it below the sidebar's own
          opaque background, hiding it entirely) — plain DOM order already
          puts it under the content, which is separately given z-10.
          md:left-60 keeps it out of the sidebar's own column (w-60) — full
          inset-0 painted over the sidebar too (same stacking level, later in
          DOM order than <aside>, so it covered it) since position:fixed
          isn't scoped to this page's own layout column. */}
      <div className="fixed inset-0 overflow-hidden bg-gradient-to-br from-[#EAF5FE] to-[#C7E5FA] md:left-60">
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-[#BEE1F9]/70 sm:h-56"
          viewBox="0 0 800 120"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,80 C150,20 350,120 550,60 C650,30 750,70 800,50 L800,120 L0,120 Z" fill="currentColor" />
        </svg>
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full text-[#8DCBF2]/60 sm:h-40"
          viewBox="0 0 800 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,60 C200,10 400,90 600,40 C700,15 750,50 800,35 L800,90 L0,90 Z" fill="currentColor" />
        </svg>
      </div>

      {/* Desktop: arrow floats in the corner */}
      <Link
        to={isEditing && code ? `/admin/patients/${code}` : '/admin/patients'}
        aria-label={isEditing ? 'Back to patient' : 'Back to patients'}
        title={isEditing ? 'Back to patient' : 'Back to patients'}
        className="absolute left-4 top-6 z-10 hidden items-center justify-center rounded-full border border-rule bg-white/80 p-1.5 text-ink-soft transition-colors hover:text-accent-deep sm:left-6 md:flex"
      >
        <ArrowLeft size={18} />
      </Link>

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-10 pt-10 md:pb-28">
        <header className="flex flex-col gap-3">
          {/* Mobile: arrow + eyebrow in a single row */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              to={isEditing && code ? `/admin/patients/${code}` : '/admin/patients'}
              aria-label={isEditing ? 'Back to patient' : 'Back to patients'}
              title={isEditing ? 'Back to patient' : 'Back to patients'}
              className="flex items-center justify-center rounded-full border border-rule bg-white/80 p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
            >
              <ArrowLeft size={16} />
            </Link>
            <p className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium uppercase tracking-wider text-accent">
              Admin · Patients
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/70 text-accent-deep">
              <HeartPulse size={26} />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="hidden text-[12px] font-medium uppercase tracking-wider text-accent md:block">Admin · Patients</p>
              <h1>{isEditing ? 'Edit patient' : 'Patient Information'}</h1>
            </div>
          </div>
        </header>

        {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}

        <form id="new-patient-form" onSubmit={handleSubmit} className="flex flex-col gap-8">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FloatingField
                label="Full name"
                icon={UserRound}
                required
                value={draft.name}
                onChange={(e) => update('name', e.target.value)}
              />
              <FloatingField
                label="Phone"
                icon={Phone}
                required
                type="tel"
                value={draft.phone}
                onChange={(e) => update('phone', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FloatingComboField
                label="City"
                icon={MapPin}
                required
                options={CITY_OPTIONS}
                value={draft.city}
                onChange={(e) => update('city', e.target.value)}
              />
              <FloatingComboField
                label="Sector"
                icon={Building2}
                required
                options={sectorOptions}
                value={draft.sector}
                onChange={(e) => update('sector', e.target.value)}
              />
            </div>

            <FloatingField
              label="Email"
              icon={Mail}
              type="email"
              value={draft.email}
              onChange={(e) => update('email', e.target.value)}
            />

            {/* DOB + Gender share one row on desktop (lg+) instead of each
                taking its own — stacked below that, same as everything
                else on mobile. */}
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex flex-col gap-1.5">
                <span className="text-body font-medium text-ink">
                  DOB <span className="text-accent">*</span>
                </span>
                <div className="inline-flex w-fit rounded-lg border border-rule bg-white/70 p-1">
                  {BIRTH_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update('birthMode', opt.value)}
                      className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        draft.birthMode === opt.value ? 'bg-accent text-white shadow-sm' : 'text-ink-soft hover:text-ink'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input + calculated age always share one row, age kept narrow
                  — on mobile this pair wraps onto its own line below the mode
                  selector rather than each block stacking separately. */}
              <div className="flex min-w-60 flex-1 gap-5">
                <div className="min-w-0 flex-1">
                  {draft.birthMode === 'dob' && (
                    <PillField
                      label="DOB"
                      icon={CalendarDays}
                      required
                      type="date"
                      value={draft.dob}
                      onChange={(e) => update('dob', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  )}
                  {draft.birthMode === 'age' && (
                    <PillField
                      label="Age"
                      icon={CalendarDays}
                      required
                      type="number"
                      min="0"
                      max="130"
                      value={draft.age}
                      onChange={(e) => update('age', e.target.value)}
                      placeholder="42"
                    />
                  )}
                  {draft.birthMode === 'year' && (
                    <PillField
                      label="Birth year"
                      icon={CalendarDays}
                      required
                      type="number"
                      min="1900"
                      max={new Date().getFullYear()}
                      value={draft.birthYear}
                      onChange={(e) => update('birthYear', e.target.value)}
                      placeholder="1984"
                    />
                  )}
                </div>
                <div className="w-24 shrink-0">
                  <span className="mb-1.5 block text-body font-medium text-ink">Age</span>
                  <div className="flex items-center gap-2 rounded-lg border border-accent bg-accent-tint px-3.5 py-2.5 text-body text-accent-deep">
                    <UserRound size={16} className="shrink-0" />
                    {age === null ? '—' : `${age}`}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-body font-medium text-ink">Gender</span>
              <div className="flex flex-wrap gap-2.5">
                {GENDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('gender', opt.value)}
                    className={`rounded-lg border px-4 py-2 text-body font-medium transition-colors ${
                      draft.gender === opt.value
                        ? 'border-accent bg-accent-tint text-accent-deep'
                        : 'border-rule bg-white/70 text-ink-soft hover:text-ink'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-body font-medium text-ink">Physical details</span>
              <Button
                type="button"
                variant="secondary"
                className="flex items-center gap-1.5 !rounded-lg !border-rule !bg-white/70 !text-ink-soft"
                onClick={() => setShowPhysicalDetails((v) => !v)}
              >
                {showPhysicalDetails ? 'Show less' : 'More details'}
                {showPhysicalDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
            </div>
            {showPhysicalDetails && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FloatingField
                  label="Height (cm)"
                  icon={UserRound}
                  type="number"
                  min="0"
                  value={draft.height}
                  onChange={(e) => update('height', e.target.value)}
                />
                <FloatingField
                  label="Weight (kg)"
                  icon={UserRound}
                  type="number"
                  min="0"
                  value={draft.weight}
                  onChange={(e) => update('weight', e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-body font-medium text-ink">Medical details</span>
              <Button
                type="button"
                variant="secondary"
                className="flex items-center gap-1.5 !rounded-lg !border-rule !bg-white/70 !text-ink-soft"
                onClick={() => setShowMedicalDetails((v) => !v)}
              >
                {showMedicalDetails ? 'Show less' : 'More details'}
                {showMedicalDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
            </div>
            {showMedicalDetails && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <span className="text-body font-medium text-ink">Medical conditions</span>
                  <div className="grid grid-cols-1 gap-2.5 rounded-2xl bg-white/70 p-4 sm:grid-cols-2">
                    {conditionOptions.map((condition) => (
                      <label key={condition} className="flex items-start gap-2 text-body text-ink">
                        <input
                          type="checkbox"
                          checked={draft.medicalConditions.includes(condition)}
                          onChange={() => toggleCondition(condition)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                        />
                        {condition}
                      </label>
                    ))}
                  </div>
                </div>

                <FloatingTextareaField
                  label="Medical history"
                  icon={ClipboardList}
                  value={draft.medicalHistory}
                  onChange={(e) => update('medicalHistory', e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Mobile only — inline at the end of the form, scrolling with
              everything else, not fixed (the desktop version below is). */}
          <div className="flex items-center justify-end gap-3 pt-2 md:hidden">
            {isEditing ? (
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setDraft(emptyDraft)}>
                Clear
              </Button>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? (isEditing ? 'Saving…' : 'Adding…') : isEditing ? 'Save changes' : 'Add patient'}
            </Button>
          </div>
        </form>
      </div>

      {/* Fixed bottom action bar, desktop only — mobile gets the inline
          version above instead (in-flow with the rest of the form). Pinned
          like the background, not part of the scrolling form. No background
          of its own — the page's gradient shows straight through it, same
          as everywhere else content sits right on that background. left-60
          clears the sidebar's own column, same reason as the background
          above. The content div above gets matching bottom padding (pb-28,
          desktop only) so the last field never sits behind this. */}
      <div className="fixed inset-x-0 bottom-0 z-20 hidden md:left-60 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-6 py-4">
          {isEditing ? (
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setDraft(emptyDraft)}>
              Clear
            </Button>
          )}
          <Button type="submit" form="new-patient-form" disabled={submitting}>
            {submitting ? (isEditing ? 'Saving…' : 'Adding…') : isEditing ? 'Save changes' : 'Add patient'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---- Page-local field styles ----
// Deliberately not touching the shared Field/ComboField/TextareaField
// (src/components/Field.tsx) — those are used across the rest of the admin
// app (Doctors, Services, …), and this redesign is scoped to this one page.

type IconType = ComponentType<{ size?: number; className?: string }>

/** Floating-label pill input: the label sits centered like a placeholder
 * when empty and unfocused, then shrinks and floats to the top border once
 * focused or filled — CSS-only, via the `peer` + `:placeholder-shown`
 * pattern (`placeholder=" "` is required for that pseudo-class to engage). */
function FloatingField({
  label,
  icon: Icon,
  required,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; icon: IconType }) {
  return (
    <label className="relative block">
      <Icon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        required={required}
        placeholder=" "
        className={`peer w-full rounded-lg border border-rule bg-white/90 py-3 pl-11 pr-4 text-body text-ink placeholder-transparent outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint ${className}`}
        {...props}
      />
      <FloatingLabelText label={label} required={required} />
    </label>
  )
}

function FloatingComboField({
  label,
  icon: Icon,
  required,
  options,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; icon: IconType; options: readonly string[] }) {
  const listId = `${label.replace(/\s+/g, '-').toLowerCase()}-options`
  return (
    <label className="relative block">
      <Icon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        list={listId}
        required={required}
        placeholder=" "
        className={`peer w-full rounded-lg border border-rule bg-white/90 py-3 pl-11 pr-4 text-body text-ink placeholder-transparent outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint ${className}`}
        {...props}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <FloatingLabelText label={label} required={required} />
    </label>
  )
}

/** Textareas don't read well with the label vertically centered (it's a much
 * taller box) — same floating idea, just anchored near the top instead. */
function FloatingTextareaField({
  label,
  icon: Icon,
  required,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; icon: IconType }) {
  return (
    <label className="relative block">
      <Icon size={18} className="pointer-events-none absolute left-4 top-4 text-ink-faint" />
      <textarea
        required={required}
        placeholder=" "
        className={`peer min-h-24 w-full resize-y rounded-2xl border border-rule bg-white/90 py-3.5 pl-11 pr-4 text-body text-ink placeholder-transparent outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint ${className}`}
        {...props}
      />
      <span
        className={
          'pointer-events-none absolute left-11 top-4 text-body text-ink-faint transition-all duration-150 ' +
          'peer-focus:top-0 peer-focus:left-4 peer-focus:-translate-y-1/2 peer-focus:rounded peer-focus:bg-white peer-focus:px-1 peer-focus:text-[11px] peer-focus:font-medium peer-focus:text-accent ' +
          'peer-[&:not(:placeholder-shown)]:top-0 peer-[&:not(:placeholder-shown)]:left-4 peer-[&:not(:placeholder-shown)]:-translate-y-1/2 peer-[&:not(:placeholder-shown)]:rounded peer-[&:not(:placeholder-shown)]:bg-white peer-[&:not(:placeholder-shown)]:px-1 peer-[&:not(:placeholder-shown)]:text-[11px] peer-[&:not(:placeholder-shown)]:font-medium peer-[&:not(:placeholder-shown)]:text-ink-soft'
        }
      >
        {label}
        {required && <span className="text-accent">*</span>}
      </span>
    </label>
  )
}

function FloatingLabelText({ label, required }: { label: string; required?: boolean }) {
  return (
    <span
      className={
        'pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-body text-ink-faint transition-all duration-150 ' +
        'peer-focus:top-0 peer-focus:left-4 peer-focus:-translate-y-1/2 peer-focus:rounded peer-focus:bg-white peer-focus:px-1 peer-focus:text-[11px] peer-focus:font-medium peer-focus:text-accent ' +
        'peer-[&:not(:placeholder-shown)]:top-0 peer-[&:not(:placeholder-shown)]:left-4 peer-[&:not(:placeholder-shown)]:-translate-y-1/2 peer-[&:not(:placeholder-shown)]:rounded peer-[&:not(:placeholder-shown)]:bg-white peer-[&:not(:placeholder-shown)]:px-1 peer-[&:not(:placeholder-shown)]:text-[11px] peer-[&:not(:placeholder-shown)]:font-medium peer-[&:not(:placeholder-shown)]:text-ink-soft'
      }
    >
      {label}
      {required && <span className="text-accent">*</span>}
    </span>
  )
}

/** Non-floating version for date/number inputs whose native rendering
 * (the browser's own dd/mm/yyyy placeholder, spinner arrows, …) doesn't mix
 * well with a floating overlay label — a small label sits above instead,
 * same pill/icon look otherwise. */
function PillField({
  label,
  icon: Icon,
  required,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; icon: IconType }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-body font-medium text-ink">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      <div className="relative">
        <Icon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          required={required}
          className={`w-full rounded-lg border border-rule bg-white/90 py-3 pl-11 pr-4 text-body text-ink placeholder:text-ink-faint outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent-tint ${className}`}
          {...props}
        />
      </div>
    </label>
  )
}
