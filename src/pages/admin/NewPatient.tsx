import { useEffect, useMemo, useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Field, ReadOnlyField, TextareaField } from '../../components/Field'
import { calculateAge } from '../../lib/age'
import { clinicalApi } from '../../lib/clinicalApi'
import { usePatients } from '../../state/PatientsContext'

interface PatientDraft {
  name: string
  phone: string
  address: string
  dob: string
  email: string
  weight: string
  medicalConditions: string[]
  medicalHistory: string
}

const emptyDraft: PatientDraft = {
  name: '',
  phone: '',
  address: '',
  dob: '',
  email: '',
  weight: '',
  medicalConditions: [],
  medicalHistory: '',
}

export function NewPatient() {
  const [draft, setDraft] = useState<PatientDraft>(emptyDraft)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conditionOptions, setConditionOptions] = useState<string[]>([])
  const { addPatient } = usePatients()
  const navigate = useNavigate()

  useEffect(() => {
    clinicalApi.listMedicalConditions().then(setConditionOptions)
  }, [])

  const age = useMemo(() => calculateAge(draft.dob), [draft.dob])

  function update<K extends keyof PatientDraft>(key: K, value: PatientDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
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
      const added = await addPatient(draft)
      navigate('/admin/patients', { state: { justAdded: added.name } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add patient')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-medium uppercase tracking-wider text-accent">Admin · Patients</p>
        <h1>Add patient</h1>
        <p className="max-w-[52ch] text-ink-soft">
          Name, phone, address, and date of birth are required — this is the record everything
          else (consultations, treatments, billing) traces back to.
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

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Date of birth"
            required
            type="date"
            value={draft.dob}
            onChange={(e) => update('dob', e.target.value)}
            max={new Date().toISOString().split('T')[0]}
          />
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
            {submitting ? 'Adding…' : 'Add patient'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDraft(emptyDraft)}>
            Clear
          </Button>
        </div>
      </form>
    </div>
  )
}