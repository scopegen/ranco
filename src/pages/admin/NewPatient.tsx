import { useEffect, useMemo, useState, type SubmitEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../components/Button'
import { Field, ReadOnlyField, TextareaField } from '../../components/Field'
import { calculateAge } from '../../lib/age'
import { clinicalApi } from '../../lib/clinicalApi'
import { usePatients, type Patient } from '../../state/PatientsContext'

type BirthMode = 'dob' | 'age' | 'year'

interface PatientDraft {
  name: string
  phone: string
  address: string
  birthMode: BirthMode
  dob: string
  age: string
  birthYear: string
  email: string
  weight: string
  medicalConditions: string[]
  medicalHistory: string
}

const emptyDraft: PatientDraft = {
  name: '',
  phone: '',
  address: '',
  birthMode: 'dob',
  dob: '',
  age: '',
  birthYear: '',
  email: '',
  weight: '',
  medicalConditions: [],
  medicalHistory: '',
}

const BIRTH_MODE_OPTIONS: { value: BirthMode; label: string }[] = [
  { value: 'dob', label: 'Date of birth' },
  { value: 'age', label: 'Age' },
  { value: 'year', label: 'Birth year only' },
]

function toDraft(patient: Patient): PatientDraft {
  return {
    name: patient.name,
    phone: patient.phone,
    address: patient.address,
    // The stored record only ever has dob OR birthYear, never both — if it's
    // birthYear, we show it as "Birth year only" rather than guessing it was
    // originally entered as an age (that detail isn't preserved in storage).
    birthMode: patient.dob ? 'dob' : 'year',
    dob: patient.dob ?? '',
    age: '',
    birthYear: patient.birthYear ? String(patient.birthYear) : '',
    email: patient.email,
    weight: patient.weight,
    medicalConditions: patient.medicalConditions,
    medicalHistory: patient.medicalHistory,
  }
}

export function NewPatient() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)

  const [draft, setDraft] = useState<PatientDraft>(emptyDraft)
  const [loadingPatient, setLoadingPatient] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conditionOptions, setConditionOptions] = useState<string[]>([])
  const { patients, addPatient, editPatient } = usePatients()
  const navigate = useNavigate()

  useEffect(() => {
    clinicalApi.listMedicalConditions().then(setConditionOptions)
  }, [])

  useEffect(() => {
    if (!id) return
    const fromList = patients.find((p) => p.id === id)
    if (fromList) {
      setDraft(toDraft(fromList))
      setLoadingPatient(false)
      return
    }
    // Not in the already-loaded list (e.g. direct link before it finished
    // loading) — fetch it directly instead.
    setLoadingPatient(true)
    clinicalApi
      .getPatient(id)
      .then((p) => setDraft(toDraft(p)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load patient'))
      .finally(() => setLoadingPatient(false))
  }, [id, patients])

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
      address: draft.address,
      dob,
      birthYear,
      email: draft.email,
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
      if (isEditing && id) {
        const updated = await editPatient(id, buildPayload())
        navigate(`/admin/patients/${updated.id}`, { state: { justUpdated: updated.name } })
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

  return (
    <div className="relative">
      {/* Desktop: arrow floats in the corner */}
      <Link
        to={isEditing && id ? `/admin/patients/${id}` : '/admin/patients'}
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
            to={isEditing && id ? `/admin/patients/${id}` : '/admin/patients'}
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
          Name, phone, address, and some form of date of birth are required — this is the record
          everything else (consultations, treatments, billing) traces back to.
        </p>
      </header>

      {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-xl border border-rule bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Full name"
            required
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Priya Sharma"
          />
          <Field
            label="Phone"
            required
            type="tel"
            value={draft.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="98765 43210"
          />
        </div>

        <TextareaField
          label="Address"
          required
          value={draft.address}
          onChange={(e) => update('address', e.target.value)}
          placeholder="House no., street, city, pincode"
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-body font-medium text-ink">
              Date of birth <span className="text-accent">*</span>
            </span>
            <span className="text-[12px] text-ink-faint">
              exact date preferred — age or birth year works if that's not known
            </span>
          </div>
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

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {draft.birthMode === 'dob' && (
            <Field
              label="Date of birth"
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
          <ReadOnlyField label="Age" value={age === null ? '—' : `${age} yrs`} />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Email"
            hint="optional"
            type="email"
            value={draft.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="priya@email.com"
          />
          <Field
            label="Weight"
            hint="optional, kg"
            type="number"
            min="0"
            value={draft.weight}
            onChange={(e) => update('weight', e.target.value)}
            placeholder="62"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-body font-medium text-ink">Medical conditions</span>
            <span className="text-[12px] text-ink-faint">optional — check any that apply</span>
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
          hint="optional — any other detail, allergies, ongoing medications"
          value={draft.medicalHistory}
          onChange={(e) => update('medicalHistory', e.target.value)}
          placeholder="e.g. penicillin allergy, on blood pressure medication"
        />

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? (isEditing ? 'Saving…' : 'Adding…') : isEditing ? 'Save changes' : 'Add patient'}
          </Button>
          {isEditing ? (
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setDraft(emptyDraft)}>
              Clear
            </Button>
          )}
        </div>
      </form>
      </div>
    </div>
  )
}