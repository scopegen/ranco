import { useState, type SubmitEvent } from 'react'
import { Eye } from 'lucide-react'
import { useClinic } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { formatDate, formatDateTime } from '../../../lib/date'
import { PaymentStatusPill } from '../../../components/PaymentStatusPill'
import { Button } from '../../../components/Button'
import { Field, SelectField } from '../../../components/Field'
import type { Patient } from '../../../state/PatientsContext'
import type { Consultation, Invoice, PaymentMode, Treatment, TreatmentBilling } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'

interface Props {
  patient: Patient
  data: PatientClinicalData
  onChange: () => void
}

// This tab is admin-only (gated in PatientDetail) — doctors never reach any
// of the payment-recording actions here; the backend also enforces that
// independently via require_admin on every endpoint these call.
export function BillingTab({ patient, data, onChange }: Props) {
  const { doctorName, serviceName } = useClinic()

  if (data.consultations.length === 0 && data.treatments.length === 0) {
    return <p className="text-ink-soft">No billing activity yet.</p>
  }

  let totalBilled = 0
  let totalCollected = 0
  for (const consultation of data.consultations) {
    totalBilled += consultation.fee
    if (consultation.paymentStatus === 'paid') totalCollected += consultation.fee
  }
  for (const treatment of data.treatments) {
    const billing = data.billingByTreatment[treatment.id]
    if (billing) {
      totalBilled += billing.servicePrice - billing.discountAmount
      totalCollected += billing.amountPaid
    }
  }
  const outstanding = totalBilled - totalCollected

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
        <SummaryTile label="Total billed" value={formatINR(totalBilled)} />
        <SummaryTile label="Collected" value={formatINR(totalCollected)} accent />
        <SummaryTile label="Outstanding" value={formatINR(outstanding)} />
      </div>

      <GenerateInvoiceSection
        patient={patient}
        treatments={data.treatments}
        billingByTreatment={data.billingByTreatment}
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
              billing={data.billingByTreatment[row.treatment.id]}
              invoice={invoiceByTreatmentId[row.treatment.id]}
              serviceName={serviceName}
              onChange={onChange}
            />
          ),
        )}
      </div>

      <InvoicesList invoices={data.invoices} treatments={data.treatments} serviceName={serviceName} />
    </div>
  )
}

function GenerateInvoiceSection({
  patient,
  treatments,
  billingByTreatment,
  serviceName,
  onChange,
}: {
  patient: Patient
  treatments: Treatment[]
  billingByTreatment: Record<string, TreatmentBilling | undefined>
  serviceName: (id: string | undefined) => string
  onChange: () => void
}) {
  const { generateInvoice, viewInvoicePdf } = useClinic()
  const invoiceable = treatments.filter(
    (t) => t.status === 'ongoing' && (billingByTreatment[t.id]?.amountPending ?? 0) > 0,
  )
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<Invoice | null>(null)
  const [viewing, setViewing] = useState(false)

  if (invoiceable.length === 0) return null

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const subtotal = [...selected].reduce((sum, id) => sum + (billingByTreatment[id]?.amountPending ?? 0), 0)
  const discountAmount = (() => {
    const value = Number(discountValue)
    if (discountType === 'none' || !value || value <= 0) return 0
    if (discountType === 'percent') return Math.min(subtotal * (Math.min(value, 100) / 100), subtotal)
    return Math.min(value, subtotal)
  })()
  const payable = subtotal - discountAmount

  async function handleGenerate() {
    setSubmitting(true)
    setError(null)
    try {
      const discount = discountType === 'none' || !discountValue ? null : { type: discountType, value: Number(discountValue) }
      const invoice = await generateInvoice(patient.id, [...selected], mode, discount)
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
    try {
      await viewInvoicePdf(generated.id)
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
            + Select treatments
          </Button>
        )}
      </div>

      {open && !generated && (
        <div className="flex flex-col gap-4 rounded-lg bg-white p-4">
          <div className="flex flex-col gap-2">
            {invoiceable.map((t) => {
              const billing = billingByTreatment[t.id]
              return (
                <label
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3.5 py-2.5"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-body text-ink">{serviceName(t.serviceId)}</span>
                  </span>
                  <span className="text-[13px] text-ink-soft">{formatINR(billing?.amountPending ?? 0)} pending</span>
                </label>
              )
            })}
          </div>

          {selected.size > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <SelectField
                  label="Payment mode"
                  options={['cash', 'card', 'upi']}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PaymentMode)}
                  className="w-32"
                />
                <SelectField
                  label="Discount"
                  options={['none', 'percent', 'amount']}
                  value={discountType}
                  onChange={(e) => {
                    setDiscountType(e.target.value as typeof discountType)
                    setDiscountValue('')
                  }}
                  className="w-32"
                />
                {discountType !== 'none' && (
                  <Field
                    label={discountType === 'percent' ? 'Percent off' : 'Amount off'}
                    type="number"
                    min="0"
                    max={discountType === 'percent' ? '100' : undefined}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percent' ? '10' : '500'}
                    className="w-32"
                  />
                )}
              </div>

              <table className="w-fit text-body">
                <tbody>
                  <tr>
                    <td className="pr-6 text-ink-soft">Total amount</td>
                    <td className="text-right font-medium text-ink">{formatINR(subtotal)}</td>
                  </tr>
                  {discountAmount > 0 && (
                    <tr>
                      <td className="pr-6 text-ink-soft">Discount</td>
                      <td className="text-right font-medium text-crit">&minus;{formatINR(discountAmount)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-rule">
                    <td className="pr-6 pt-1 font-medium text-ink">Amount payable</td>
                    <td className="pt-1 text-right text-subheading font-bold text-accent-deep">{formatINR(payable)}</td>
                  </tr>
                </tbody>
              </table>

              {error && <p className="text-[13px] text-crit">{error}</p>}

              <div className="flex gap-3">
                <Button onClick={handleGenerate} disabled={submitting}>
                  {submitting ? 'Generating…' : `Generate invoice for ${formatINR(payable)}`}
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
  amount,
  paid,
  expanded,
  onToggle,
}: {
  label: string
  date: string
  amount: number
  paid: boolean
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-body font-medium text-ink">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="View billing details"
          title="View"
          className={`flex items-center justify-center rounded-[20px] bg-paper-raised p-1.5 transition-colors ${
            expanded ? 'bg-accent-tint text-accent-deep' : 'text-ink-soft hover:bg-accent-tint hover:text-accent-deep'
          }`}
        >
          <Eye size={13} />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-ink-faint">{formatDate(date)}</span>
        <span className="font-medium text-ink">{formatINR(amount)}</span>
        <PaymentStatusPill status={paid ? 'paid' : 'unpaid'} />
      </div>
    </div>
  )
}

function ConsultationBillingCard({
  consultation,
  doctorName,
  onChange,
}: {
  consultation: Consultation
  doctorName: (id: string | undefined) => string
  onChange: () => void
}) {
  const { recordConsultationPayment } = useClinic()
  const [expanded, setExpanded] = useState(false)
  const [payFormOpen, setPayFormOpen] = useState(false)
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPaid = consultation.paymentStatus === 'paid'
  const amountPaid = isPaid ? consultation.fee : 0
  const amountPending = isPaid ? 0 : consultation.fee

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      await recordConsultationPayment(consultation.patientId, consultation.id, mode)
      setPayFormOpen(false)
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-4 shadow-sm">
      <CardHeader
        label="Consultation"
        date={consultation.consultDate}
        amount={consultation.fee}
        paid={isPaid}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-rule pt-3">
          <p className="text-[12px] text-ink-faint">{doctorName(consultation.doctorId)}</p>

          <table className="w-fit text-[13px]">
            <tbody>
              <tr>
                <td className="pr-6 text-ink-soft">Amount to pay</td>
                <td className="text-right font-medium text-ink">{formatINR(consultation.fee)}</td>
              </tr>
              <tr>
                <td className="pr-6 text-ink-soft">Amount paid</td>
                <td className="text-right font-medium text-ink">{formatINR(amountPaid)}</td>
              </tr>
              <tr>
                <td className="pr-6 text-ink-soft">Amount pending</td>
                <td className="text-right font-medium text-ink">{formatINR(amountPending)}</td>
              </tr>
            </tbody>
          </table>

          {isPaid && consultation.paidAt && (
            <p className="text-[12px] text-ink-faint">
              Paid {formatDateTime(consultation.paidAt)} via {(consultation.paymentMode ?? '').toUpperCase()}
            </p>
          )}

          {!isPaid &&
            (payFormOpen ? (
              <div className="flex flex-wrap items-end gap-3 rounded-lg bg-paper-raised p-3">
                <SelectField
                  label="Payment mode"
                  options={['cash', 'card', 'upi']}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PaymentMode)}
                  className="w-32"
                />
                <Button onClick={handleConfirm} disabled={submitting}>
                  {submitting ? 'Saving…' : `Confirm ${formatINR(consultation.fee)} paid`}
                </Button>
                <Button variant="ghost" onClick={() => setPayFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setPayFormOpen(true)}>
                Record payment
              </Button>
            ))}

          {error && <p className="text-[13px] text-crit">{error}</p>}
        </div>
      )}
    </div>
  )
}

function TreatmentBillingCard({
  treatment,
  billing,
  invoice,
  serviceName,
  onChange,
}: {
  treatment: Treatment
  billing: TreatmentBilling | undefined
  invoice: Invoice | undefined
  serviceName: (id: string | undefined) => string
  onChange: () => void
}) {
  const { updateTreatmentDiscount, addTreatmentPayment } = useClinic()
  const [expanded, setExpanded] = useState(false)
  const [discountFormOpen, setDiscountFormOpen] = useState(false)
  const [paymentFormOpen, setPaymentFormOpen] = useState(false)

  const serviceLabel = serviceName(treatment.serviceId)

  if (!billing) {
    return (
      <div className="rounded-xl border border-rule bg-white p-4 shadow-sm">
        <p className="text-body text-ink-soft">{serviceLabel} — loading billing…</p>
      </div>
    )
  }

  const chargeAfterDiscount = billing.servicePrice - billing.discountAmount

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-4 shadow-sm">
      <CardHeader
        label={serviceLabel}
        date={treatment.startedAt}
        amount={chargeAfterDiscount}
        paid={billing.amountPending <= 0}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-rule pt-3">
          <table className="w-fit text-[13px]">
            <tbody>
              <tr>
                <td className="pr-6 text-ink-soft">Service charge</td>
                <td className="text-right font-medium text-ink">{formatINR(billing.servicePrice)}</td>
              </tr>
              {billing.discountAmount > 0 && (
                <tr>
                  <td className="pr-6 text-ink-soft">Discount</td>
                  <td className="text-right font-medium text-crit">&minus;{formatINR(billing.discountAmount)}</td>
                </tr>
              )}
              <tr className="border-t border-rule">
                <td className="pr-6 pt-1 text-ink-soft">Amount to pay</td>
                <td className="pt-1 text-right font-medium text-ink">{formatINR(chargeAfterDiscount)}</td>
              </tr>
              <tr>
                <td className="pr-6 text-ink-soft">Amount paid</td>
                <td className="text-right font-medium text-ink">{formatINR(billing.amountPaid)}</td>
              </tr>
              <tr>
                <td className="pr-6 text-ink-soft">Amount pending</td>
                <td className="text-right font-medium text-ink">{formatINR(billing.amountPending)}</td>
              </tr>
            </tbody>
          </table>

          {discountFormOpen ? (
            <DiscountForm
              billing={billing}
              onSave={async (discount) => {
                await updateTreatmentDiscount(treatment.id, discount)
                setDiscountFormOpen(false)
                onChange()
              }}
              onCancel={() => setDiscountFormOpen(false)}
            />
          ) : (
            <Button variant="secondary" onClick={() => setDiscountFormOpen(true)}>
              {billing.discountType ? 'Edit discount' : '+ Add discount'}
            </Button>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              Payments ({billing.payments.length})
            </p>
            {billing.payments.length === 0 && <p className="text-[13px] text-ink-faint">No payments recorded yet.</p>}
            {billing.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-ink-soft">{formatDateTime(payment.paidAt)}</span>
                <span className="text-ink-faint">{payment.paymentMode.toUpperCase()}</span>
                <span className="font-medium text-ink">{formatINR(payment.amount)}</span>
              </div>
            ))}
          </div>

          {billing.amountPending > 0 &&
            (paymentFormOpen ? (
              <AddPaymentForm
                maxAmount={billing.amountPending}
                onSave={async (amount, mode) => {
                  await addTreatmentPayment(treatment.id, { amount, paymentMode: mode })
                  setPaymentFormOpen(false)
                  onChange()
                }}
                onCancel={() => setPaymentFormOpen(false)}
              />
            ) : (
              <Button variant="secondary" onClick={() => setPaymentFormOpen(true)}>
                + Add payment
              </Button>
            ))}

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

function DiscountForm({
  billing,
  onSave,
  onCancel,
}: {
  billing: TreatmentBilling
  onSave: (discount: { type: 'percent' | 'amount'; value: number } | null) => Promise<void>
  onCancel: () => void
}) {
  const [type, setType] = useState<'none' | 'percent' | 'amount'>(billing.discountType ?? 'none')
  const [value, setValue] = useState(billing.discountValue != null ? String(billing.discountValue) : '')
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

function AddPaymentForm({
  maxAmount,
  onSave,
  onCancel,
}: {
  maxAmount: number
  onSave: (amount: number, mode: PaymentMode) => Promise<void>
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(String(maxAmount))
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
      await onSave(numeric, mode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record the payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg bg-paper-raised p-3">
      <Field
        label="Amount"
        type="number"
        min="0"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-32"
      />
      <SelectField
        label="Payment mode"
        options={['cash', 'card', 'upi']}
        value={mode}
        onChange={(e) => setMode(e.target.value as PaymentMode)}
        className="w-32"
      />
      {error && <p className="w-full text-[13px] text-crit">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save payment'}
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