import { useEffect, useState, type SubmitEvent } from 'react'
import { Download, Eye, Pencil, X } from 'lucide-react'
import { useClinic } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { formatDate, formatDateTime } from '../../../lib/date'
import { Pill } from '../../../components/Pill'
import { Button } from '../../../components/Button'
import { Field, SelectField } from '../../../components/Field'
import type { Patient } from '../../../state/PatientsContext'
import type { BillingHistoryEvent, Consultation, Invoice, PaymentMode, Treatment } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'

/** Stage 1 — corrects the base amount UPWARD before any discount is applied
 * on top. Increase-only: decreasing the price is what discount (stage 2) is
 * for, so there's no direction here. Mirrors the backend's
 * app.billing_math.apply_price_adjustment exactly. */
function applyPriceAdjustment(
  baseAmount: number,
  type: 'percent' | 'amount' | null | undefined,
  value: number | null | undefined,
): number {
  if (!type || !value) return baseAmount
  const amount = type === 'percent' ? baseAmount * (value / 100) : value
  return baseAmount + amount
}

/** Stage 2 — a percent or a flat amount off some base, capped so it can
 * never take the charge below zero. Used both for what's actually saved and
 * for the pricing form's live preview, so the two never disagree. Always
 * called with the STAGE-1-ADJUSTED price as `baseAmount`, never the raw
 * service price/fee. */
function applyDiscount(
  baseAmount: number,
  type: 'percent' | 'amount' | null | undefined,
  value: number | null | undefined,
): { discountAmount: number; charge: number } {
  let discountAmount = 0
  if (type && value) {
    discountAmount = type === 'percent' ? baseAmount * (value / 100) : value
    discountAmount = Math.min(discountAmount, baseAmount)
  }
  return { discountAmount, charge: baseAmount - discountAmount }
}

/** (servicePrice, adjustedPrice, discountAmount, charge) for one treatment —
 * mirrors the backend's own `_treatment_charge` exactly (adjust, then
 * discount on the adjusted price), so what's shown here always matches what
 * the Billing summary and invoices actually total. Uses the price snapshot
 * on the treatment itself, never the service's live catalog price. */
function treatmentCharge(
  t: Treatment,
): { servicePrice: number; adjustedPrice: number; discountAmount: number; charge: number } {
  const servicePrice = t.servicePrice
  const adjustedPrice = applyPriceAdjustment(servicePrice, t.priceAdjustmentType, t.priceAdjustmentValue)
  const { discountAmount, charge } = applyDiscount(adjustedPrice, t.discountType, t.discountValue)
  return { servicePrice, adjustedPrice, discountAmount, charge }
}

/** Same math, for a consultation's fee — same adjustment + discount stages,
 * same per-service billing concern, just a different base amount. */
function consultationCharge(
  c: Consultation,
): { fee: number; adjustedFee: number; discountAmount: number; charge: number } {
  const fee = c.fee
  const adjustedFee = applyPriceAdjustment(fee, c.priceAdjustmentType, c.priceAdjustmentValue)
  const { discountAmount, charge } = applyDiscount(adjustedFee, c.discountType, c.discountValue)
  return { fee, adjustedFee, discountAmount, charge }
}

/** "INV-0016" — the invoice's human-readable sequential number, matching
 * how it's printed on the invoice PDF itself. */
function invoiceNumberStr(invoiceNumber: number): string {
  return `INV-${String(invoiceNumber).padStart(4, '0')}`
}

/** "10% off" / "₹100 off" for the collapsed card header — undefined when
 * there's no discount, so the caller can skip rendering the badge. */
function discountLabel(type: 'percent' | 'amount' | null | undefined, value: number | null | undefined): string | undefined {
  if (!type || !value) return undefined
  return type === 'percent' ? `${value}% off` : `${formatINR(value)} off`
}

/** "+10%" / "+₹100" for the collapsed card header — undefined when there's
 * no price adjustment, so the caller can skip rendering the badge. Always a
 * "+" since price adjustment only ever increases the price. */
function adjustmentLabel(type: 'percent' | 'amount' | null | undefined, value: number | null | undefined): string | undefined {
  if (!type || !value) return undefined
  return type === 'percent' ? `+${value}%` : `+${formatINR(value)}`
}

// This tab is admin-only (gated in the section page) — doctors never reach
// any of the billing actions here; the backend also enforces that
// independently via require_admin on every endpoint these call.
export function BillingTab({ patient, data, onChange, openPaymentSignal }: Props) {
  const { doctorName, serviceName } = useClinic()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [seenPaymentSignal, setSeenPaymentSignal] = useState(openPaymentSignal)

  // openPaymentSignal is the navigation's location.key whenever the FAB's
  // "Add payment" sent us here — a plain boolean prop only opens the modal
  // on first mount, so it silently did nothing the second time you were
  // already sitting on the Billing tab and clicked it again (no remount, so
  // useState's initial value is never re-read). Adjusted here during render
  // (React's recommended way to sync state to a changing prop, instead of an
  // effect) so it reliably reopens every time, since React Router hands out
  // a fresh key on every navigate() call even when the path doesn't change.
  if (openPaymentSignal && openPaymentSignal !== seenPaymentSignal) {
    setSeenPaymentSignal(openPaymentSignal)
    setPaymentOpen(true)
  }

  if (data.consultations.length === 0 && data.treatments.length === 0) {
    return <p className="text-ink-soft">No billing activity yet.</p>
  }

  const summary = data.billingSummary ?? { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 }

  const invoiceByTreatmentId: Record<string, Invoice | undefined> = {}
  const invoiceByConsultationId: Record<string, Invoice | undefined> = {}
  for (const invoice of data.invoices) {
    for (const line of invoice.lines) {
      if (line.treatmentId) invoiceByTreatmentId[line.treatmentId] = invoice
      if (line.consultationId) invoiceByConsultationId[line.consultationId] = invoice
    }
  }

  type Row =
    | { kind: 'consultation'; date: string; consultation: Consultation }
    | { kind: 'treatment'; date: string; treatment: Treatment }

  const rows: Row[] = [
    ...data.consultations.map((c): Row => ({ kind: 'consultation', date: c.consultDate, consultation: c })),
    // Pending treatments (added, not started) aren't billed yet and have no
    // start date — nothing to show here until they actually start.
    ...data.treatments
      .filter((t) => t.status !== 'pending')
      .map((t): Row => ({ kind: 'treatment', date: t.startedAt!, treatment: t })),
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
        consultations={data.consultations}
        invoiceByTreatmentId={invoiceByTreatmentId}
        invoiceByConsultationId={invoiceByConsultationId}
        serviceName={serviceName}
        onChange={onChange}
      />

      <div className="flex flex-col gap-3">
        {rows.map((row) =>
          row.kind === 'consultation' ? (
            <ConsultationBillingCard
              key={row.consultation.id}
              consultation={row.consultation}
              invoice={invoiceByConsultationId[row.consultation.id]}
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
  // The triggering navigation's location.key when arriving via the FAB's
  // "Add payment" quick action, null/undefined otherwise — see the effect
  // in BillingTab for why this needs to be a changing key, not a boolean.
  openPaymentSignal?: string | null
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
        <SelectField
          label="Payment mode"
          options={['cash', 'card', 'upi']}
          value={mode}
          onChange={(e) => setMode(e.target.value as PaymentMode)}
          className="uppercase"
        />

        {error && <p className="text-[13px] text-crit">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save payment'}
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
        // Newest first, most recent payment/bill/invoice on top — the
        // backend already returns it sorted this way, but re-sorting here
        // too keeps that guaranteed regardless of API order.
        if (!cancelled) setEvents([...res].sort((a, b) => b.date.localeCompare(a.date)))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load billing history')
      })
    return () => {
      cancelled = true
    }
  }, [patientId, getBillingHistory])

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
                  <span className="text-[12px] text-ink-faint">{formatDate(event.date)}</span>
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
  consultations,
  invoiceByTreatmentId,
  invoiceByConsultationId,
  serviceName,
  onChange,
}: {
  patient: Patient
  treatments: Treatment[]
  consultations: Consultation[]
  invoiceByTreatmentId: Record<string, Invoice | undefined>
  invoiceByConsultationId: Record<string, Invoice | undefined>
  serviceName: (id: string | undefined) => string
  onChange: () => void
}) {
  const { generateInvoice, viewInvoicePdf, saveInvoicePdf } = useClinic()
  // Invoices show the full listed price, always — a treatment/consultation
  // just needs to not already be on an invoice. Status (ongoing/finished) or
  // payment status no longer matter here since invoicing doesn't touch them.
  const invoiceableTreatments = treatments.filter((t) => t.status !== 'pending' && !invoiceByTreatmentId[t.id])
  const invoiceableConsultations = consultations.filter((c) => !invoiceByConsultationId[c.id])
  const [open, setOpen] = useState(false)
  const [selectedTreatments, setSelectedTreatments] = useState<Set<string>>(new Set())
  const [selectedConsultations, setSelectedConsultations] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<Invoice | null>(null)
  const [viewing, setViewing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)

  if (invoiceableTreatments.length === 0 && invoiceableConsultations.length === 0) return null

  function toggleTreatment(id: string) {
    setSelectedTreatments((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleConsultation(id: string) {
    setSelectedConsultations((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedCount = selectedTreatments.size + selectedConsultations.size
  const total =
    [...selectedTreatments].reduce((sum, id) => sum + (invoiceableTreatments.find((t) => t.id === id)?.servicePrice ?? 0), 0) +
    [...selectedConsultations].reduce((sum, id) => sum + (invoiceableConsultations.find((c) => c.id === id)?.fee ?? 0), 0)

  async function handleGenerate() {
    setSubmitting(true)
    setError(null)
    try {
      // Payment mode isn't asked here (or shown on the invoice) — an invoice
      // is just a record of what's owed, not of how it was actually
      // settled; that's what Add Payment (on this same tab) is for. The
      // backend still stores a value, but nothing displays it anymore.
      const invoice = await generateInvoice(patient.id, [...selectedTreatments], [...selectedConsultations], 'cash')
      setGenerated(invoice)
      setSelectedTreatments(new Set())
      setSelectedConsultations(new Set())
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

  async function handleDownload() {
    if (!generated) return
    setDownloading(true)
    setViewError(null)
    try {
      await saveInvoicePdf(generated.id, `invoice-${invoiceNumberStr(generated.invoiceNumber)}.pdf`)
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Failed to download the invoice')
    } finally {
      setDownloading(false)
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
            {invoiceableConsultations.map((c) => (
              <label key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3.5 py-2.5">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedConsultations.has(c.id)}
                    onChange={() => toggleConsultation(c.id)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-body text-ink">Consultation &middot; {formatDate(c.consultDate)}</span>
                </span>
                <span className="text-[13px] text-ink-soft">{formatINR(c.fee)}</span>
              </label>
            ))}
            {invoiceableTreatments.map((t) => (
              <label key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3.5 py-2.5">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedTreatments.has(t.id)}
                    onChange={() => toggleTreatment(t.id)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-body text-ink">{serviceName(t.serviceId)}</span>
                </span>
                <span className="text-[13px] text-ink-soft">{formatINR(t.servicePrice)}</span>
              </label>
            ))}
          </div>

          {selectedCount > 0 && (
            <>
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

          {selectedCount === 0 && (
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
            Invoice generated — <span className="font-medium">{formatINR(generated.finalTotal)}</span>.
          </p>
          {viewError && <p className="text-[13px] text-crit">{viewError}</p>}
          <div className="flex gap-3">
            <Button variant="tint" onClick={handleView} disabled={viewing} className="flex items-center gap-1.5">
              <Eye size={16} />
              <span className="hidden md:inline">{viewing ? 'Opening…' : 'View invoice'}</span>
            </Button>
            <Button variant="tint" onClick={handleDownload} disabled={downloading} className="flex items-center gap-1.5">
              <Download size={16} />
              <span className="hidden md:inline">{downloading ? 'Downloading…' : 'Download'}</span>
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
  const { viewInvoicePdf, saveInvoicePdf } = useClinic()
  const [viewing, setViewing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const labels = invoice.lines
    .map((line) =>
      line.treatmentId ? serviceName(treatments.find((t) => t.id === line.treatmentId)?.serviceId) : 'Consultation',
    )
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

  async function handleDownload() {
    setDownloading(true)
    setError(null)
    try {
      await saveInvoicePdf(invoice.id, `invoice-${invoiceNumberStr(invoice.invoiceNumber)}.pdf`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download the invoice')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-body font-medium text-ink">{labels || `${invoice.lines.length} item(s)`}</span>
          <span className="text-[12px] text-ink-faint">
            {invoiceNumberStr(invoice.invoiceNumber)} &middot; {formatDateTime(invoice.issuedAt)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-medium text-ink">{formatINR(invoice.finalTotal)}</span>
          <div className="flex items-center gap-2">
            <Button variant="tint" onClick={handleView} disabled={viewing} className="flex items-center gap-1.5">
              <Eye size={16} />
              <span className="hidden md:inline">{viewing ? 'Opening…' : 'View'}</span>
            </Button>
            <Button variant="tint" onClick={handleDownload} disabled={downloading} className="flex items-center gap-1.5">
              <Download size={16} />
              <span className="hidden md:inline">{downloading ? 'Downloading…' : 'Download'}</span>
            </Button>
          </div>
        </div>
      </div>
      {error && <p className="text-[13px] text-crit">{error}</p>}
    </div>
  )
}

function CardHeader({
  label,
  date,
  charge,
  adjustmentLabel,
  discountLabel,
  expanded,
  onToggle,
}: {
  label: string
  date: string
  // The service/consultation charge — shown right beside the name so it's
  // visible without expanding the card.
  charge: number
  // e.g. "+10%" / "−₹100" — omitted entirely when there's no price adjustment.
  adjustmentLabel?: string
  // e.g. "10% off" / "₹100 off" — omitted entirely when there's no discount.
  discountLabel?: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-ink">
          {label} <span className="font-normal text-ink-soft">&middot; {formatINR(charge)}</span>
        </span>
        <span className="text-[12px] text-ink-faint">{formatDate(date)}</span>
      </div>
      <div className="flex items-center gap-3">
        {adjustmentLabel && <Pill variant="warning">{adjustmentLabel}</Pill>}
        {discountLabel && <Pill variant="accent">{discountLabel}</Pill>}
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

// Price adjustment + discount editing only — consultations are billed
// automatically the moment they're created, and payment now happens only
// through the combined Add
// Payment action above, never per-consultation.
function ConsultationBillingCard({
  consultation,
  invoice,
  doctorName,
  onChange,
}: {
  consultation: Consultation
  invoice: Invoice | undefined
  doctorName: (id: string | undefined) => string
  onChange: () => void
}) {
  const { updateConsultationDiscount } = useClinic()
  const [expanded, setExpanded] = useState(false)
  const [pricingFormOpen, setPricingFormOpen] = useState(false)
  const [adjustmentType, setAdjustmentType] = useState<'none' | 'percent' | 'amount'>(consultation.priceAdjustmentType ?? 'none')
  const [adjustmentValue, setAdjustmentValue] = useState(
    consultation.priceAdjustmentValue != null ? String(consultation.priceAdjustmentValue) : '',
  )
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>(consultation.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(consultation.discountValue != null ? String(consultation.discountValue) : '')
  const {
    fee,
    adjustedFee: savedAdjustedFee,
    discountAmount: savedDiscountAmount,
    charge: savedCharge,
  } = consultationCharge(consultation)

  // While the pricing form is open, the table below shows a live preview of
  // what Save will produce; closed, it falls back to the last-saved figures.
  const adjustedFee = pricingFormOpen
    ? applyPriceAdjustment(fee, adjustmentType === 'none' ? null : adjustmentType, Number(adjustmentValue) || null)
    : savedAdjustedFee
  const { discountAmount, charge } = pricingFormOpen
    ? applyDiscount(adjustedFee, discountType === 'none' ? null : discountType, Number(discountValue) || null)
    : { discountAmount: savedDiscountAmount, charge: savedCharge }

  function openPricingForm() {
    setAdjustmentType(consultation.priceAdjustmentType ?? 'none')
    setAdjustmentValue(consultation.priceAdjustmentValue != null ? String(consultation.priceAdjustmentValue) : '')
    setDiscountType(consultation.discountType ?? 'none')
    setDiscountValue(consultation.discountValue != null ? String(consultation.discountValue) : '')
    setPricingFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-4 shadow-sm">
      <CardHeader
        label="Consultation"
        date={consultation.consultDate}
        charge={savedCharge}
        adjustmentLabel={adjustmentLabel(consultation.priceAdjustmentType, consultation.priceAdjustmentValue)}
        discountLabel={discountLabel(consultation.discountType, consultation.discountValue)}
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
              {adjustedFee !== fee && (
                <tr>
                  <td className="pr-6 text-ink-soft">Price adjustment</td>
                  <td className={`text-right font-medium ${adjustedFee > fee ? 'text-ink' : 'text-crit'}`}>
                    {adjustedFee > fee ? '+' : '−'}
                    {formatINR(Math.abs(adjustedFee - fee))}
                  </td>
                </tr>
              )}
              {discountAmount > 0 && (
                <tr>
                  <td className="pr-6 text-ink-soft">Discount</td>
                  <td className="text-right font-medium text-crit">&minus;{formatINR(discountAmount)}</td>
                </tr>
              )}
              <tr className="border-t border-rule">
                <td className="pr-6 pt-1 text-ink-soft">Total amount</td>
                <td className="pt-1 text-right font-medium text-ink">{formatINR(charge)}</td>
              </tr>
            </tbody>
          </table>

          {pricingFormOpen ? (
            <PricingForm
              adjustmentType={adjustmentType}
              adjustmentValue={adjustmentValue}
              onAdjustmentTypeChange={setAdjustmentType}
              onAdjustmentValueChange={setAdjustmentValue}
              discountType={discountType}
              discountValue={discountValue}
              onDiscountTypeChange={setDiscountType}
              onDiscountValueChange={setDiscountValue}
              onSave={async (adjustment, discount) => {
                await updateConsultationDiscount(consultation.id, adjustment, discount)
                setPricingFormOpen(false)
                onChange()
              }}
              onCancel={() => setPricingFormOpen(false)}
            />
          ) : (
            <Button variant="secondary" onClick={openPricingForm}>
              {consultation.priceAdjustmentType || consultation.discountType ? 'Edit pricing' : '+ Adjust price / discount'}
            </Button>
          )}

          {invoice && (
            <p className="text-[12px] text-ink-faint">
              Invoice generated — {formatINR(invoice.finalTotal)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Price adjustment + discount editing only — payment against a treatment's
// charge happens through the combined Add Payment action above, not here.
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
  const [pricingFormOpen, setPricingFormOpen] = useState(false)
  const [adjustmentType, setAdjustmentType] = useState<'none' | 'percent' | 'amount'>(treatment.priceAdjustmentType ?? 'none')
  const [adjustmentValue, setAdjustmentValue] = useState(
    treatment.priceAdjustmentValue != null ? String(treatment.priceAdjustmentValue) : '',
  )
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>(treatment.discountType ?? 'none')
  const [discountValue, setDiscountValue] = useState(treatment.discountValue != null ? String(treatment.discountValue) : '')

  const serviceLabel = serviceName(treatment.serviceId)
  const {
    servicePrice,
    adjustedPrice: savedAdjustedPrice,
    discountAmount: savedDiscountAmount,
    charge: savedCharge,
  } = treatmentCharge(treatment)

  // While the pricing form is open, the table below shows a live preview of
  // what Save will produce; closed, it falls back to the last-saved figures.
  const adjustedPrice = pricingFormOpen
    ? applyPriceAdjustment(servicePrice, adjustmentType === 'none' ? null : adjustmentType, Number(adjustmentValue) || null)
    : savedAdjustedPrice
  const { discountAmount, charge } = pricingFormOpen
    ? applyDiscount(adjustedPrice, discountType === 'none' ? null : discountType, Number(discountValue) || null)
    : { discountAmount: savedDiscountAmount, charge: savedCharge }

  function openPricingForm() {
    setAdjustmentType(treatment.priceAdjustmentType ?? 'none')
    setAdjustmentValue(treatment.priceAdjustmentValue != null ? String(treatment.priceAdjustmentValue) : '')
    setDiscountType(treatment.discountType ?? 'none')
    setDiscountValue(treatment.discountValue != null ? String(treatment.discountValue) : '')
    setPricingFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-white p-4 shadow-sm">
      <CardHeader
        label={serviceLabel}
        // TreatmentBillingCard only ever receives non-pending treatments (see the rows filter above)
        date={treatment.startedAt!}
        charge={savedCharge}
        adjustmentLabel={adjustmentLabel(treatment.priceAdjustmentType, treatment.priceAdjustmentValue)}
        discountLabel={discountLabel(treatment.discountType, treatment.discountValue)}
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
              {adjustedPrice !== servicePrice && (
                <tr>
                  <td className="pr-6 text-ink-soft">Price adjustment</td>
                  <td className={`text-right font-medium ${adjustedPrice > servicePrice ? 'text-ink' : 'text-crit'}`}>
                    {adjustedPrice > servicePrice ? '+' : '−'}
                    {formatINR(Math.abs(adjustedPrice - servicePrice))}
                  </td>
                </tr>
              )}
              {discountAmount > 0 && (
                <tr>
                  <td className="pr-6 text-ink-soft">Discount</td>
                  <td className="text-right font-medium text-crit">&minus;{formatINR(discountAmount)}</td>
                </tr>
              )}
              <tr className="border-t border-rule">
                <td className="pr-6 pt-1 text-ink-soft">Total amount</td>
                <td className="pt-1 text-right font-medium text-ink">{formatINR(charge)}</td>
              </tr>
            </tbody>
          </table>

          {pricingFormOpen ? (
            <PricingForm
              adjustmentType={adjustmentType}
              adjustmentValue={adjustmentValue}
              onAdjustmentTypeChange={setAdjustmentType}
              onAdjustmentValueChange={setAdjustmentValue}
              discountType={discountType}
              discountValue={discountValue}
              onDiscountTypeChange={setDiscountType}
              onDiscountValueChange={setDiscountValue}
              onSave={async (adjustment, discount) => {
                await updateTreatmentDiscount(treatment.id, adjustment, discount)
                setPricingFormOpen(false)
                onChange()
              }}
              onCancel={() => setPricingFormOpen(false)}
            />
          ) : (
            <Button variant="secondary" onClick={openPricingForm}>
              {treatment.priceAdjustmentType || treatment.discountType ? 'Edit pricing' : '+ Adjust price / discount'}
            </Button>
          )}

          {invoice && (
            <p className="text-[12px] text-ink-faint">
              Invoice generated — {formatINR(invoice.finalTotal)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Shared by both TreatmentBillingCard and ConsultationBillingCard.
 * Controlled by the parent (all type/value state lives there, not here) so
 * the parent's Price adjustment/Discount/Total amount rows above can update
 * live, on every keystroke, instead of only after Save.
 *
 * Two independent, ordered stages — see applyPriceAdjustment/applyDiscount
 * above: the price increase (on the base price, saved first) and the
 * discount (decrease-only, computed on the adjusted price). Either, both, or
 * neither can be set. */
function PricingForm({
  adjustmentType,
  adjustmentValue,
  onAdjustmentTypeChange,
  onAdjustmentValueChange,
  discountType,
  discountValue,
  onDiscountTypeChange,
  onDiscountValueChange,
  onSave,
  onCancel,
}: {
  adjustmentType: 'none' | 'percent' | 'amount'
  adjustmentValue: string
  onAdjustmentTypeChange: (type: 'none' | 'percent' | 'amount') => void
  onAdjustmentValueChange: (value: string) => void
  discountType: 'none' | 'percent' | 'amount'
  discountValue: string
  onDiscountTypeChange: (type: 'none' | 'percent' | 'amount') => void
  onDiscountValueChange: (value: string) => void
  onSave: (
    adjustment: { type: 'percent' | 'amount'; value: number } | null,
    discount: { type: 'percent' | 'amount'; value: number } | null,
  ) => Promise<void>
  onCancel: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      let adjustment: { type: 'percent' | 'amount'; value: number } | null = null
      if (adjustmentType !== 'none') {
        const numeric = Number(adjustmentValue)
        if (!numeric || numeric <= 0) {
          setError('Enter a price increase greater than 0.')
          return
        }
        adjustment = { type: adjustmentType, value: numeric }
      }

      let discount: { type: 'percent' | 'amount'; value: number } | null = null
      if (discountType !== 'none') {
        const numeric = Number(discountValue)
        if (!numeric || numeric <= 0) {
          setError('Enter a discount greater than 0.')
          return
        }
        discount = { type: discountType, value: numeric }
      }

      await onSave(adjustment, discount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the pricing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-paper-raised p-3">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Price increase"
          options={['none', 'percent', 'amount']}
          value={adjustmentType}
          onChange={(e) => {
            onAdjustmentTypeChange(e.target.value as typeof adjustmentType)
            onAdjustmentValueChange('')
          }}
          className="w-32"
        />
        {adjustmentType !== 'none' && (
          <Field
            label={adjustmentType === 'percent' ? 'Percent' : 'Amount'}
            type="number"
            min="0"
            max={adjustmentType === 'percent' ? '100' : undefined}
            value={adjustmentValue}
            onChange={(e) => onAdjustmentValueChange(e.target.value)}
            placeholder={adjustmentType === 'percent' ? '10' : '500'}
            className="w-32"
          />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Discount"
          options={['none', 'percent', 'amount']}
          value={discountType}
          onChange={(e) => {
            onDiscountTypeChange(e.target.value as typeof discountType)
            onDiscountValueChange('')
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
            onChange={(e) => onDiscountValueChange(e.target.value)}
            placeholder={discountType === 'percent' ? '10' : '500'}
            className="w-32"
          />
        )}
      </div>
      {error && <p className="text-[13px] text-crit">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function SummaryTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-rule bg-white p-4 shadow-sm">
      <p className="text-[9px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-1 text-heading font-bold ${accent ? 'text-accent-deep' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
