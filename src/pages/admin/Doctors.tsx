import { useState, type SubmitEvent } from 'react'
import { useAuth } from '../../state/AuthContext'
import { useClinic } from '../../state/ClinicContext'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'

export function Doctors() {
  const { staff } = useAuth()
  const { doctors, loading, addDoctor } = useClinic()
  const isAdmin = staff?.role === 'admin'
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1>Doctors</h1>
          <p className="text-ink-soft">{loading ? 'Loading…' : `${doctors.length} on staff`}</p>
        </div>
        {isAdmin && (
          <Button variant={formOpen ? 'ghost' : 'primary'} onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? 'Cancel' : '+ Add doctor'}
          </Button>
        )}
      </div>

      {!isAdmin && (
        <p className="rounded-lg bg-paper-raised px-3.5 py-2.5 text-body text-ink-soft">
          Read-only — only Admin can add doctors.
        </p>
      )}

      {formOpen && isAdmin && (
        <AddDoctorForm
          onSubmit={async (input) => {
            await addDoctor(input)
            setFormOpen(false)
          }}
          onCancel={() => setFormOpen(false)}
        />
      )}

      <div className="flex flex-col gap-2">
        {doctors.map((doctor) => (
          <div key={doctor.id} className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-body font-medium text-ink">{doctor.name}</span>
              <span className="text-[12px] text-ink-faint">
                {doctor.specialty ?? 'General Dentistry'} · {doctor.email}
              </span>
            </div>
          </div>
        ))}
        {!loading && doctors.length === 0 && <p className="text-ink-soft">No doctors added yet.</p>}
      </div>
    </div>
  )
}

function AddDoctorForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: { name: string; specialty?: string; email: string; password: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({ name, specialty: specialty || undefined, email, password })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add doctor')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Priya Nair" />
        <Field label="Specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Orthodontist" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="drnair@rancodental.com" />
        <Field
          label="Password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Set a login password"
        />
      </div>
      {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add doctor'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}