import { useEffect, useState, type SubmitEvent } from 'react'
import { Pencil, X } from 'lucide-react'
import { useClinic } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { formatDate, formatDateTime } from '../../../lib/date'
import { PaymentStatusPill } from '../../../components/PaymentStatusPill'
import { Button } from '../../../components/Button'
import { Field, SelectField } from '../../../components/Field'
import type { Patient } from '../../../state/PatientsContext'
import type { BillingHistoryEvent, Consultation, Invoice, PaymentMode, Treatment } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'

/** (servicePrice, discountAmount, charge) for one treatment — mirrors the
 * backend's own `_treatment_charge` exactly, so what's shown here always
 * matches what the Billing summary and invoices actually total. Uses the
 * price snapshot on the treatment itself, never the service's live catalog
 * price. */
function treatmentCharge(t: Treatment): { servicePrice: number; discountAmount: number; charge: number } {
  const servicePrice = t.servicePrice
  let discountAmount = 0
  if (t.discountType && t.discountValue) {
    discountAmount = t.discountType === 'percent' ? servicePrice * (t.discountValue / 100) : t.discountValue
    discountAmount = Math.min(discountAmount, servicePrice)
  }
  return { servicePrice, discountAmount, charge: servicePrice - discountAmount }
}

/** Same math, for a consultation's fee — same two discount types, same
 * per-service billing concern, just a different base amount. */
function consultationCharge(c: Consultation): { fee: number; discountAmount: number; charge: number } {
  const fee = c.fee
  let discountAmount = 0
  if (c.discountType && c.discountValue) {
    discountAmount = c.discountType === 'percent' ? fee * (c.discountValue / 100) : c.discountValue
    discountAmount = Math.min(discountAmount, fee)
  }
  return { fee, discountAmount, charge: fee - discountAmount }
}

// This tab is admin-only (gated in the section page) — doctors never reach
// any of the billing actions here; the backend also enforces that
// independently via require_admin on every endpoint these call.
export function BillingTab({ patient, data, onChange }: Props) {
  const { doctorName, serviceName } = useClinic()
  const [paymentOpen, setPaymentOpen] = useState(false)

  if (data.consultations.length === 0 && data.treatments.length === 0) {
    return <p className="text-ink-soft">No billing activity yet.</p>
  }

  const summary = data.billingSummary ?? { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 }

  const invoiceByTreatmentId: Record<string, Invoice | undefined> = {}
  for (const invoice of data.invoices) {
    for (const line of invoice.lines) invoiceByTreatmentId[line.treatmentId] = invoice
  }

  type Row =
    | { kind: 'consultation'; date: string; consultation: Consultation }
    | { kind: 'treatment'; date: string; treatment: Treatment }

  const rows: Row[] = [
    ...data.consultations.map((c): Row => ({ kind: 'consultation', date: c.consultDate, consultation: c })),
    ...data.treatments.map((t): Row => ({ kind: 'treatment', date: t.startedAt, treatment: t })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Total billed" value={formatINR(summary.totalBilled)} />
        <SummaryTile label="Collected" value={formatINR(summary.totalPaid)} accent />
        <SummaryTile label="Outstanding" value={formatINR(summary.totalOutstanding)} />
      </div>

      {/* Standalone — not linked to any consultation or treatment. A single
          payment always goes against the patient's combined outstanding
          balance. */}
      <Button onClick={() => setPaymentOpen(true)}>+ Add payment</Button>

      <GenerateInvoiceSection
        patient={patient}
        treatments={data.treatments}
        invoiceByTreatmentId={invoiceByTreatmentId}
        serviceName={serviceName}
        onChange={onChange}
      />

      <div className="flex flex-col gap-3">
        {rows.map((row) =>
          row.kind === 'consultation' ? (
            <ConsultationBillingCard
              key={row.consultation.id}
              consultation={row.consultation}
              doctorName={doctorName}
              onChange={onChange}
            />
          ) : (
            <TreatmentBillingCard
              key={row.treatment.id}
              treatment={row.treatment}
              invoice={invoiceByTreatmentId[row.treatment.id]}
              serviceName={serviceName}
              onChange={onChange}
            />
          ),
        )}
      </div>

      <InvoicesList invoices={data.invoices} treatments={data.treatments} serviceName={serviceName} />

      {paymentOpen && (
        <AddPaymentModal
          patient={patient}
          outstanding={summary.totalOutstanding}
          onClose={() => setPaymentOpen(false)}
          onSaved={() => {
            setPaymentOpen(false)
            onChange()
          }}
        />
      )}
    </div>
  )
}

interface Props {
  patient: Patient
  data: PatientClinicalData
  onChange: () => void
}

function AddPaymentModal({
  patient,
  outstanding,
  onClose,
  onSaved,
}: {
  patient: Patient
  outstanding: number
  onClose: () => void
  onSaved: () => void
}) {
  const { addPatientPayment } = useClinic()
  const [amount, setAmount] = useState(outstanding > 0 ? String(outstanding) : '')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const numeric = Number(amount)
      if (!numeric || numeric <= 0) {
        setError('Enter an amount greater than 0.')
        return
      }
      await addPatientPayment(patient.id, { amount: numeric, paymentMode: mode, paidAt: date ? `${date}T00:00:00` : undefined })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record the payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-ink/40 px-4 pt-20 sm:pt-28" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-rule bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-subheading font-medium text-ink">Add payment</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-full p-1.5 text-ink-soft transition-colors hover:bg-paper-raised hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <table className="w-fit text-body">
          <tbody>
            <tr>
              <td className="pr-6 text-ink-soft">Total outstanding</td>
              <td className="text-right font-medium text-ink">{formatINR(outstanding)}</td>
            </tr>
          </tbody>
        </table>

        <Field
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <SelectField label="Payment mode" options={['cash', 'card', 'upi']} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} />

        {error && <p className="text-[13px] text-crit">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save payment'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

export function BillingHistoryModal({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { getBillingHistory } = useClinic()
  const [events, setEvents] = useState<BillingHistoryEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getBillingHistory(patientId)
      .then((res) => {
        if (!cancelled) setEvents(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load billing history')
      })
    return () => {
      cancelled = true
    }
  }, [patientId, getBillingHistory])

  const kindLabel: Record<BillingHistoryEvent['kind'], string> = {
    consultation_billed: 'Consultation billed',
    consultation_paid: 'Consultation paid',
    treatment_billed: 'Treatment billed',
    payment: 'Payment received',
    invoice: 'Invoice generated',
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-ink/40 px-4 pt-20 sm:pt-28" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col gap-4 rounded-xl border border-rule bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-subheading font-medium text-ink">Billing history</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-full p-1.5 text-ink-soft transition-colors hover:bg-paper-raised hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto">
          {error && <p className="text-[13px] text-crit">{error}</p>}
          {!error && events === null && <p className="py-4 text-center text-body text-ink-soft">Loading…</p>}
          {events !== null && events.length === 0 && (
            <p className="py-4 text-center text-body text-ink-soft">No billing activity yet.</p>
          )}
          {events !== null &&
            events.map((event, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3.5 py-2.5"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-body font-medium text-ink">{event.label}</span>
                  <span className="text-[12px] text-ink-faint">
                    {formatDateTime(event.date)}
                    {event.mode && ` · ${event.mode.toUpperCase()}`}
                    {' · '}
                    {kindLabel[event.kind]}
                  </span>
                </div>
                <span
                  className={`font-medium ${event.kind === 'payment' ? 'text-accent-deep' : 'text-ink'}`}
                >
                  {event.kind === 'payment' ? '+' : ''}
                  {formatINR(event.amount)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function GenerateInvoiceSection({
  patient,
  treatments,
  invoiceByTreatmentId,
  serviceName,
  onChange,
}: {
  patient: Patient
  treatments: Treatment[]
  invoiceByTreatmentId: Record<string, Invoice | undefined>
  serviceName: (id: string | undefined) => string
  onChange: () => void
}) {
  const { generateInvoice, viewInvoicePdf } = useClinic()
  // Invoices show the full listed price, always — a treatment just needs to
  // not already be on an invoice. Status (ongoing/finished) no longer
  // matters here since invoicing doesn't touch it anymore.
  const invoiceable = treatments.filter((t) => !invoiceByTreatmentId[t.id])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<Invoice | null>(null)
  const [viewing, setViewing] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)

  if (invoiceable.length === 0) return null

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = [...selected].reduce((sum, id) => {
    const t = invoiceable.find((tt) => tt.id === id)
    return sum + (t ? t.servicePrice : 0)
  }, 0)

  async function handleGenerate() {
    setSubmitting(true)
    setError(null)
    try {
      const invoice = await generateInvoice(patient.id, [...selected], mode)
      setGenerated(invoice)
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the invoice')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleView() {
    if (!generated) return
    setViewing(true)
    setViewError(null)
    try {
      await viewInvoicePdf(generated.id)
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Failed to open the invoice')
    } finally {
      setViewing(false)
    }
  }

  function handleDone() {
    setGenerated(null)
    setOpen(false)
    onChange()
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-accent bg-accent-tint p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-subheading font-medium text-ink">Generate invoice</p>
        {!open && !generated && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            + Select
          </Button>
        )}
      </div>

      {open && !generated && (
        <div className="flex flex-col gap-4 rounded-lg bg-white p-4">
          {/* Full listed price only — discounts are a Billing-tab concern
              and never appear on the invoice document itself. */}
          <div className="flex flex-col gap-2">
            {invoiceable.map((t) => (
              <label key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3.5 py-2.5">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-body text-ink">{serviceName(t.serviceId)}</span>
                </span>
                <span className="text-[13px] text-ink-soft">{formatINR(t.servicePrice)}</span>
              </label>
            ))}
          </div>

          {selected.size > 0 && (
            <>
              <SelectField
                label="Payment mode"
                options={['cash', 'card', 'upi']}
                value={mode}
                onChange={(e) => setMode(e.target.value as PaymentMode)}
                className="w-32"
              />

              <table className="w-fit text-body">
                <tbody>
                  <tr>
                    <td className="pr-6 font-medium text-ink">Total</td>
                    <td className="text-right text-subheading font-bold text-accent-deep">{formatINR(total)}</td>
                  </tr>
                </tbody>
              </table>

              {error && <p className="text-[13px] text-crit">{error}</p>}

              <div className="flex gap-3">
                <Button onClick={handleGenerate} disabled={submitting}>
                  {submitting ? 'Generating…' : `Generate invoice for ${formatINR(total)}`}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {selected.size === 0 && (
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {generated && (
        <div className="flex flex-col gap-4 rounded-lg bg-white p-4">
          <p className="text-body text-ink">
            Invoice generated — <span className="font-medium">{formatINR(generated.finalTotal)}</span> via{' '}
            {generated.paymentMode.toUpperCase()}.
          </p>
          {viewError && <p className="text-[13px] text-crit">{viewError}</p>}
          <div className="flex gap-3">
            <Button onClick={handleView} disabled={viewing}>
              {viewing ? 'Opening…' : 'View invoice'}
            </Button>
            <Button variant="ghost" onClick={handleDone}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function InvoicesList({
  invoices,
  treatments,
  serviceName,
}: {
  invoices: Invoice[]
  treatments: Treatment[]
  serviceName: (id: string | undefined) => string
}) {
  if (invoices.length === 0) return null

  const sorted = [...invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Invoices ({invoices.length})</p>
      {sorted.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} treatments={treatments} serviceName={serviceName} />
      ))}
    </div>
  )
}

function InvoiceRow({
  invoice,
  treatments,
  serviceName,
}: {
  invoice: Invoice
  treatments: Treatment[]
  serviceName: (id: string | undefined) => string
}) {
  const { viewInvoicePdf } = useClinic()
  const [viewing, setViewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const labels = invoice.lines
    .map((line) => serviceName(treatments.find((t) => t.id === line.treatmentId)?.serviceId))
    .join(', ')

  async function handleView() {
    setViewing(true)
    setError(null)
    try {
      await viewInvoicePdf(invoice.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open the invoice')
    } finally {
      setViewing(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-body font-medium text-ink">{labels || `${invoice.lines.length} treatment(s)`}</span>
          <span className="text-[12px] text-ink-faint">
            {formatDateTime(invoice.issuedAt)} &middot; {invoice.paymentMode.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium text-ink">{formatINR(invoice.finalTotal)}</span>
          <Button variant="ghost" onClick={handleView} disabled={viewing}>
            {viewing ? 'Opening…' : 'View'}
          </Button>
        </div>
      </div>
      {error && <p className="text-[13px] text-crit">{error}</p>}
    </div>
  )
}

function CardHeader({
  label,
  date,
  paid,
  expanded,
  onToggle,
}: {
  label: string
  date: string
  paid: boolean
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-ink">{label}</span>
        <span className="text-[12px] text-ink-faint">{formatDate(date)}</span>
      </div>
      <div className="flex items-center gap-3">
        <PaymentStatusPill status={paid ? 'paid' : 'unpaid'} />
        <button
          type="button"
          onClick={onToggle}
          aria-label="View billing details"
          title="View"
          className={`flex items-center justify-center rounded-[20px] bg-paper-raised p-1.5 transition-colors ${
            expanded ? 'bg-accent-tint text-accent-deep' : 'text-ink-soft hover:bg-accent-tint hover:text-accent-deep'
          }`}
        >
          <Pencil size={13} />
        </button>
      </div>
    </div>
  )
}

// Discount editing only — consultations are billed automatically the moment
// they're created, and payment now happens only through the combined Add
// Payment action above, never per-consultation.
function ConsultationBillingCard({
  consultation,
  doctorName,
  onChange,
}: {
  consultation: Consultation
  doctorName: (id: string | undefined) => string
  onChange: () => void
}) {
  const { updateConsultationDiscount } = useClinic()
  const [expanded, setExpanded] = useState(false)
  const [discountFormOpen, setDiscountFormOpen] = useState(false)
  const isPaid = consultation.paymentStatus === 'paid'
  const { fee, discountAmount, charge } = consultationCharge(consultation)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-4 shadow-sm">
      <CardHeader
        label="Consultation"
        date={consultation.consultDate}
        paid={isPaid}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-rule pt-3">
          <p className="text-[12px] text-ink-faint">{doctorName(consultation.doctorId)}</p>

          <table className="w-fit text-[13px]">
            <tbody>
              <tr>
                <td className="pr-6 text-ink-soft">Fee</td>
                <td className="text-right font-medium text-ink">{formatINR(fee)}</td>
              </tr>
              {discountAmount > 0 && (
                <tr>
                  <td className="pr-6 text-ink-soft">Discount</td>
                  <td className="text-right font-medium text-crit">&minus;{formatINR(discountAmount)}</td>
                </tr>
              )}
              <tr className="border-t border-rule">
                <td className="pr-6 pt-1 text-ink-soft">Charge</td>
                <td className="pt-1 text-right font-medium text-ink">{formatINR(charge)}</td>
              </tr>
            </tbody>
          </table>

          {discountFormOpen ? (
            <DiscountForm
              current={consultation}
              onSave={async (discount) => {
                await updateConsultationDiscount(consultation.id, discount)
                setDiscountFormOpen(false)
                onChange()
              }}
              onCancel={() => setDiscountFormOpen(false)}
            />
          ) : (
            <Button variant="secondary" onClick={() => setDiscountFormOpen(true)}>
              {consultation.discountType ? 'Edit discount' : '+ Add discount'}
            </Button>
          )}

          {isPaid && consultation.paidAt && (
            <p className="text-[12px] text-ink-faint">
              Paid {formatDateTime(consultation.paidAt)} via {(consultation.paymentMode ?? '').toUpperCase()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Discount editing only — payment against a treatment's charge happens
// through the combined Add Payment action above, not here.
function TreatmentBillingCard({
  treatment,
  invoice,
  serviceName,
  onChange,
}: {
  treatment: Treatment
  invoice: Invoice | undefined
  serviceName: (id: string | undefined) => string
  onChange: () => void
}) {
  const { updateTreatmentDiscount } = useClinic()
  const [expanded, setExpanded] = useState(false)
  const [discountFormOpen, setDiscountFormOpen] = useState(false)

  const serviceLabel = serviceName(treatment.serviceId)
  const { servicePrice, discountAmount, charge } = treatmentCharge(treatment)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-4 shadow-sm">
      <CardHeader
        label={serviceLabel}
        date={treatment.startedAt}
        paid={Boolean(invoice)}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-rule pt-3">
          <table className="w-fit text-[13px]">
            <tbody>
              <tr>
                <td className="pr-6 text-ink-soft">Service charge</td>
                <td className="text-right font-medium text-ink">{formatINR(servicePrice)}</td>
              </tr>
              {discountAmount > 0 && (
                <tr>
                  <td className="pr-6 text-ink-soft">Discount</td>
                  <td className="text-right font-medium text-crit">&minus;{formatINR(discountAmount)}</td>
                </tr>
              )}
              <tr className="border-t border-rule">
                <td className="pr-6 pt-1 text-ink-soft">Charge</td>
                <td className="pt-1 text-right font-medium text-ink">{formatINR(charge)}</td>
              </tr>
            </tbody>
          </table>

          {discountFormOpen ? (
            <DiscountForm
              current={treatment}
              onSave={async (discount) => {
                await updateTreatmentDiscount(treatment.id, discount)
                setDiscountFormOpen(false)
                onChange()
              }}
              onCancel={() => setDiscountFormOpen(false)}
            />
          ) : (
            <Button variant="secondary" onClick={() => setDiscountFormOpen(true)}>
              {treatment.discountType ? 'Edit discount' : '+ Add discount'}
            </Button>
          )}

          {invoice && (
            <p className="text-[12px] text-ink-faint">
              Invoice generated — {formatINR(invoice.finalTotal)} via {invoice.paymentMode.toUpperCase()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Shared by both TreatmentBillingCard and ConsultationBillingCard — `current`
 * just needs to carry the existing discount, if any, to pre-fill the form. */
function DiscountForm({
  current,
  onSave,
  onCancel,
}: {
  current: { discountType?: 'percent' | 'amount' | null; discountValue?: number | null }
  onSave: (discount: { type: 'percent' | 'amount'; value: number } | null) => Promise<void>
  onCancel: () => void
}) {
  const [type, setType] = useState<'none' | 'percent' | 'amount'>(current.discountType ?? 'none')
  const [value, setValue] = useState(current.discountValue != null ? String(current.discountValue) : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (type === 'none') {
        await onSave(null)
      } else {
        const numeric = Number(value)
        if (!numeric || numeric <= 0) {
          setError('Enter a discount greater than 0.')
          return
        }
        await onSave({ type, value: numeric })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the discount')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg bg-paper-raised p-3">
      <SelectField
        label="Discount"
        options={['none', 'percent', 'amount']}
        value={type}
        onChange={(e) => {
          setType(e.target.value as typeof type)
          setValue('')
        }}
        className="w-32"
      />
      {type !== 'none' && (
        <Field
          label={type === 'percent' ? 'Percent off' : 'Amount off'}
          type="number"
          min="0"
          max={type === 'percent' ? '100' : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={type === 'percent' ? '10' : '500'}
          className="w-32"
        />
      )}
      {error && <p className="w-full text-[13px] text-crit">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save'}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}

function SummaryTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-rule bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-1 text-heading font-bold ${accent ? 'text-accent-deep' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
