import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { Pencil } from 'lucide-react'
import { useAuth } from '../../state/AuthContext'
import { useClinic } from '../../state/ClinicContext'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { SignaturePad } from '../../components/SignaturePad'
import type { Staff } from '../../types/clinical'

export function Doctors() {
  const { staff } = useAuth()
  const { doctors, loading, addDoctor, updateDoctor } = useClinic()
  const isAdmin = staff?.role === 'admin'
  const [formOpen, setFormOpen] = useState(false)
  // Only one row editable at a time — same one-at-a-time pattern as every
  // other inline-edit form in the app (e.g. BillingTab's pricing form).
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1>Doctors</h1>
          <p className="text-ink-soft">{loading ? 'Loading…' : `${doctors.length} on staff`}</p>
        </div>
        {isAdmin && (
          <Button
            variant={formOpen ? 'ghost' : 'primary'}
            onClick={() => {
              setEditingId(null)
              setFormOpen((v) => !v)
            }}
          >
            {formOpen ? 'Cancel' : '+ Add doctor'}
          </Button>
        )}
      </div>

      {!isAdmin && (
        <p className="rounded-lg bg-paper-raised px-3.5 py-2.5 text-body text-ink-soft">
          Read-only — only Admin can add or edit doctors.
        </p>
      )}

      {formOpen && isAdmin && (
        <DoctorForm
          submitLabel="Add doctor"
          onSubmit={async (input) => {
            await addDoctor(input)
            setFormOpen(false)
          }}
          onCancel={() => setFormOpen(false)}
        />
      )}

      <div className="flex flex-col gap-2">
        {doctors.map((doctor) =>
          editingId === doctor.id ? (
            <DoctorForm
              key={doctor.id}
              initial={doctor}
              submitLabel="Save changes"
              onSubmit={async (input) => {
                await updateDoctor(doctor.id, input)
                setEditingId(null)
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={doctor.id} className="flex flex-col gap-3 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-body font-medium text-ink">{doctor.name}</span>
                  <span className="text-[12px] text-ink-faint">
                    {doctor.specialty ?? 'General Dentistry'} · {doctor.email}
                    {doctor.registrationNo && ` · Reg. No. ${doctor.registrationNo}`}
                  </span>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormOpen(false)
                      setEditingId(doctor.id)
                    }}
                    aria-label={`Edit ${doctor.name}`}
                    title="Edit"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-raised hover:text-accent-deep"
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
              {isAdmin && <DoctorSignatureSection doctor={doctor} />}
            </div>
          ),
        )}
        {!loading && doctors.length === 0 && <p className="text-ink-soft">No doctors added yet.</p>}
      </div>
    </div>
  )
}

/** Shared by "+ Add doctor" and the per-row "Edit" pencil — same fields
 * either way. Password is required to add (a brand-new login has to start
 * with one) but optional to edit (blank leaves the current password
 * untouched — this is an edit form, not a "reset password" flow). */
function DoctorForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Staff
  submitLabel: string
  onSubmit: (input: { name: string; specialty?: string; registrationNo?: string; email: string; password: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [specialty, setSpecialty] = useState(initial?.specialty ?? '')
  const [registrationNo, setRegistrationNo] = useState(initial?.registrationNo ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = Boolean(initial)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        name,
        specialty: specialty || undefined,
        registrationNo: registrationNo || undefined,
        email,
        password,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? 'save' : 'add'} doctor`)
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
        <Field
          label="Registration No."
          value={registrationNo}
          onChange={(e) => setRegistrationNo(e.target.value)}
          placeholder="A-17490"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="drnair@rancodental.com" />
        <Field
          label="Password"
          required={!isEdit}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEdit ? 'Leave blank to keep the current password' : 'Set a login password'}
        />
      </div>
      {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-body text-crit">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** Shown on the prescription PDF, next to the doctor's name/designation
 * (see backend/app/pdf.py's _signature_block_html) — admin-only to manage,
 * same as everything else on this page. Two ways in, either upload a
 * photo/scan or draw it on-screen; both end up going through the same
 * background-stripping step server-side (see app/signature.py), so which
 * one was used makes no visible difference in the end. */
function DoctorSignatureSection({ doctor }: { doctor: Staff }) {
  const { setDoctorSignature, clearDoctorSignature } = useClinic()
  const [drawing, setDrawing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function save(imageData: string) {
    setSubmitting(true)
    setError(null)
    try {
      await setDoctorSignature(doctor.id, imageData)
      setDrawing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the signature')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => save(reader.result as string)
    reader.onerror = () => setError('Failed to read that file')
    reader.readAsDataURL(file)
  }

  async function handleRemove() {
    setSubmitting(true)
    setError(null)
    try {
      await clearDoctorSignature(doctor.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the signature')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-rule pt-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Signature</span>
        {doctor.signatureImage && (
          <img
            src={`data:image/png;base64,${doctor.signatureImage}`}
            alt={`${doctor.name}'s signature`}
            className="h-10 max-w-[160px] rounded border border-rule bg-white px-1"
          />
        )}
      </div>

      {drawing ? (
        <SignaturePad onSave={save} onCancel={() => setDrawing(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileChange} />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
            {submitting ? 'Saving…' : doctor.signatureImage ? 'Upload a new one' : 'Upload signature'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDrawing(true)} disabled={submitting}>
            Draw signature
          </Button>
          {doctor.signatureImage && (
            <Button type="button" variant="ghost" onClick={handleRemove} disabled={submitting}>
              Remove
            </Button>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-[13px] text-crit">{error}</p>}
    </div>
  )
}
