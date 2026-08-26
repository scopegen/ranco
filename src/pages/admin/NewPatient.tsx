import { useEffect, useMemo, useState, type SubmitEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '../../components/Button'
import { ComboField, Field, ReadOnlyField, TextareaField } from '../../components/Field'
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
// typed (see ComboField).
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
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
        <p className="text-ink-soft">Loading patient…</p>
      </div>
    )
  }

  if (isEditing && !editingPatient) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-6 py-16 text-center">
        <h1>Patient not found</h1>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Desktop: arrow floats in the corner */}
      <Link
        to={isEditing && code ? `/admin/patients/${code}` : '/admin/patients'}
        aria-label={isEditing ? 'Back to patient' : 'Back to patients'}
        title={isEditing ? 'Back to patient' : 'Back to patients'}
        className="absolute left-4 top-6 hidden items-center justify-center rounded-full p-1.5 text-ink-soft transition-colors hover:bg-paper-raised hover:text-accent-deep sm:left-6 md:flex"
      >
        <ArrowLeft size={18} />
      </Link>

      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        {/* Mobile: arrow + eyebrow in a single row */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            to={isEditing && code ? `/admin/patients/${code}` : '/admin/patients'}
            aria-label={isEditing ? 'Back to patient' : 'Back to patients'}
            title={isEditing ? 'Back to patient' : 'Back to patients'}
            className="flex items-center justify-center rounded-full border border-rule bg-paper-raised p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
          >
            <ArrowLeft size={16} />
          </Link>
          <p className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium uppercase tracking-wider text-accent">
            Admin · Patients
          </p>
        </div>
        <p className="hidden text-[12px] font-medium uppercase tracking-wider text-accent md:block">Admin · Patients</p>
        <h1>{isEditing ? 'Edit patient' : 'Add patient'}</h1>
        <p className="max-w-[52ch] text-ink-soft">

        </p>
      </header>

      {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8 rounded-xl border border-rule bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5">
          <h2 className="border-b border-rule pb-2 text-subheading font-medium text-ink">Personal info</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Full name"
              required
              value={draft.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Full Name"
            />
            <Field
              label="Phone"
              required
              type="tel"
              value={draft.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="9999999999"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <ComboField
              label="City"
              required
              options={CITY_OPTIONS}
              value={draft.city}
              onChange={(e) => update('city', e.target.value)}
              placeholder="Noida"
            />
            <ComboField
              label="Sector"
              required
              options={sectorOptions}
              value={draft.sector}
              onChange={(e) => update('sector', e.target.value)}
              placeholder="Sector 62"
            />
          </div>

          <Field
            label="Email"
            type="email"
            value={draft.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="ranco@email.com"
          />

          <div className="flex flex-wrap items-end gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-body font-medium text-ink">
                DOB <span className="text-accent">*</span>
              </span>
              <div className="inline-flex w-fit rounded-lg border border-rule bg-paper-raised p-1">
                {BIRTH_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('birthMode', opt.value)}
                    className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                      draft.birthMode === opt.value
                        ? 'bg-white text-accent shadow-sm'
                        : 'text-ink-soft hover:text-ink'
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
                  <Field
                    label="DOB"
                    required
                    type="date"
                    value={draft.dob}
                    onChange={(e) => update('dob', e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                  />
                )}
                {draft.birthMode === 'age' && (
                  <Field
                    label="Age"
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
                  <Field
                    label="Birth year"
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
                <ReadOnlyField label="Age" value={age === null ? '—' : `${age} yrs`} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-body font-medium text-ink">Gender</span>
            </div>
            <div className="flex flex-wrap gap-5">
              {GENDER_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-body text-ink">
                  <input
                    type="radio"
                    name="gender"
                    checked={draft.gender === opt.value}
                    onChange={() => update('gender', opt.value)}
                    className="h-4 w-4 accent-accent"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-rule pb-2">
            <span className="text-body font-medium text-ink">Physical details</span>
            <Button
              type="button"
              variant="secondary"
              className="flex items-center gap-1.5"
              onClick={() => setShowPhysicalDetails((v) => !v)}
              
            >
              {showPhysicalDetails ? 'Show less' : 'More details'}
              {showPhysicalDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>
          </div>
          {showPhysicalDetails && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Height"
                type="number"
                min="0"
                value={draft.height}
                onChange={(e) => update('height', e.target.value)}
                placeholder="165 cm"
              />
              <Field
                label="Weight"
                type="number"
                min="0"
                value={draft.weight}
                onChange={(e) => update('weight', e.target.value)}
                placeholder="62 kg"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-rule pb-2">
            <span className="text-body font-medium text-ink">Medical details</span>
            <Button
              type="button"
              variant="secondary"
              className="flex items-center gap-1.5"
              onClick={() => setShowMedicalDetails((v) => !v)}
            >
              {showMedicalDetails ? 'Show less' : 'More details'}
              {showMedicalDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>
          </div>
          {showMedicalDetails && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body font-medium text-ink">Medical conditions</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-rule bg-paper-raised p-4 sm:grid-cols-2">
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

              <TextareaField
                label="Medical history"
                value={draft.medicalHistory}
                onChange={(e) => update('medicalHistory', e.target.value)}
                placeholder=""
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
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
    </div>
  )
}
