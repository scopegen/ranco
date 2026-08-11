import { useMemo, useState, type SubmitEvent } from 'react'
import { FileText } from 'lucide-react'
import { Pill } from '../../../components/Pill'
import { PaymentStatusPill } from '../../../components/PaymentStatusPill'
import { Button } from '../../../components/Button'
import { Field, SelectField, TextareaField } from '../../../components/Field'
import type { Patient } from '../../../state/PatientsContext'
import { useClinic, today } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { formatDate } from '../../../lib/date'
import { visitAmount, type Invoice, type PaymentMode, type Treatment, type Visit } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'

interface Props {
  patient: Patient
  data: PatientClinicalData
  onChange: () => void
}

export function TreatmentsTab({ patient, data, onChange }: Props) {
  if (data.treatments.length === 0) {
    return <p className="text-ink-soft">No treatments yet — start one from the Consultations tab.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {data.treatments.map((treatment) => (
        <TreatmentCard
          key={treatment.id}
          patient={patient}
          treatment={treatment}
          visits={data.visitsByTreatment[treatment.id] ?? []}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

function TreatmentCard({
  patient,
  treatment,
  visits,
  onChange,
}: {
  patient: Patient
  treatment: Treatment
  visits: Visit[]
  onChange: () => void
}) {
  const { doctorName, serviceName, logVisit, addPrescription, generateInvoice, viewInvoicePdf } = useClinic()
  const [visitFormOpen, setVisitFormOpen] = useState(false)
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false)
  const [viewingInvoice, setViewingInvoice] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)

  const unpaidTotal = visits.filter((v) => v.paymentStatus === 'unpaid').reduce((sum, v) => sum + visitAmount(v), 0)
  const serviceLabel = serviceName(treatment.serviceId)

  // Not called until the user is done with the "view invoice" step below —
  // this refreshes patient data, which flips treatment.status to 'finished'
  // and would otherwise unmount the invoice form (and its View Invoice
  // button) before there's a chance to use it.
  function handleInvoiceDone() {
    setInvoiceFormOpen(false)
    onChange()
  }

  async function handleViewInvoice() {
    setViewingInvoice(true)
    setViewError(null)
    try {
      await viewInvoicePdf(treatment.id)
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Failed to open the invoice')
    } finally {
      setViewingInvoice(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-subheading font-medium text-ink">{serviceLabel}</p>
          <p className="text-[12px] text-ink-faint">
            {doctorName(treatment.doctorId)} · started {formatDate(treatment.startedAt)}
            {treatment.completedAt && ` · finished ${formatDate(treatment.completedAt)}`}
          </p>
        </div>
        {treatment.status === 'finished' ? (
          <Pill variant="solid">Finished</Pill>
        ) : (
          <Pill variant="outline">Ongoing</Pill>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-rule pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Visits ({visits.length})</p>
        {visits.length === 0 && <p className="text-[13px] text-ink-faint">No visits logged yet.</p>}
        {visits.map((visit) => (
          <div key={visit.id} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-ink-soft">{formatDate(visit.visitDate)}</span>
            <span className="font-medium text-ink">{formatINR(visitAmount(visit))}</span>
            <PaymentStatusPill status={visit.paymentStatus} />
          </div>
        ))}
      </div>

      {treatment.status === 'ongoing' && (
        <div className="flex flex-col gap-4 border-t border-rule pt-4">
          {!visitFormOpen && !invoiceFormOpen && (
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setVisitFormOpen(true)}>
                + Log visit
              </Button>
              <Button variant="secondary" onClick={() => setInvoiceFormOpen(true)}>
                Mark finished / generate invoice
              </Button>
            </div>
          )}

          {visitFormOpen && (
            <LogVisitForm
              onSubmit={async (input) => {
                const visit = await logVisit(treatment.id, input)
                if (input.prescription) {
                  await addPrescription({
                    patientId: patient.id,
                    visitId: visit.id,
                    diagnosis: input.prescription.diagnosis,
                    notes: input.prescription.notes,
                    advice: input.prescription.advice,
                    nextVisit: input.prescription.nextVisit,
                  })
                }
                setVisitFormOpen(false)
                onChange()
              }}
              onCancel={() => setVisitFormOpen(false)}
            />
          )}

          {invoiceFormOpen && (
            <GenerateInvoiceForm
              treatmentId={treatment.id}
              unpaidTotal={unpaidTotal}
              generateInvoice={generateInvoice}
              viewInvoicePdf={viewInvoicePdf}
              onDone={handleInvoiceDone}
              onCancel={() => setInvoiceFormOpen(false)}
            />
          )}
        </div>
      )}

      {treatment.status === 'finished' && (
        <div className="flex flex-col gap-2 border-t border-rule pt-4">
          <Button variant="secondary" onClick={handleViewInvoice} disabled={viewingInvoice}>
            <FileText size={15} className="mr-1.5 inline" />
            {viewingInvoice ? 'Opening…' : 'View invoice'}
          </Button>
          {viewError && <p className="text-[13px] text-crit">{viewError}</p>}
        </div>
      )}
    </div>
  )
}

interface PrescriptionInput {
  diagnosis?: string
  notes: string
  advice?: string
  nextVisit?: string
}

function LogVisitForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: {
    visitDate: string
    listedPrice: number
    paymentStatus: 'paid' | 'unpaid'
    paymentMode?: PaymentMode
    prescription?: PrescriptionInput
  }) => Promise<void>
  onCancel: () => void
}) {
  const [visitDate, setVisitDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [paidNow, setPaidNow] = useState(false)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [submitting, setSubmitting] = useState(false)

  const [addRx, setAddRx] = useState(false)
  const [diagnosis, setDiagnosis] = useState('')
  const [rxNotes, setRxNotes] = useState('')
  const [advice, setAdvice] = useState('')
  const [nextVisit, setNextVisit] = useState('')

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({
        visitDate,
        listedPrice: Number(amount),
        paymentStatus: paidNow ? 'paid' : 'unpaid',
        paymentMode: paidNow ? paymentMode : undefined,
        prescription: addRx
          ? {
              diagnosis: diagnosis || undefined,
              notes: rxNotes,
              advice: advice || undefined,
              nextVisit: nextVisit || undefined,
            }
          : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-paper-raised p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Visit date" required type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} max={today()} />
        <Field label="Amount" required type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500" />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-body text-ink">
          <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} className="h-4 w-4 accent-accent" />
          Paid at this visit
        </label>
        {paidNow && (
          <SelectField
            label="Payment mode"
            options={['cash', 'card', 'upi']}
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            className="w-40"
          />
        )}
      </div>

      <label className="flex items-center gap-2 border-t border-rule pt-4 text-body text-ink">
        <input type="checkbox" checked={addRx} onChange={(e) => setAddRx(e.target.checked)} className="h-4 w-4 accent-accent" />
        Add a prescription for this visit
      </label>

      {addRx && (
        <div className="flex flex-col gap-4 rounded-lg bg-white p-4">
          <Field label="Diagnosis" hint="optional" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Deep caries, tooth 36" />
          <TextareaField
            label="Rx"
            required
            value={rxNotes}
            onChange={(e) => setRxNotes(e.target.value)}
            placeholder={'One medicine per line, e.g.\nAmoxicillin 500mg — 1-0-1 — 5 days\nIbuprofen 400mg — as needed for pain'}
          />
          <Field label="Advice" hint="optional" value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="e.g. Avoid hot/cold food for 2 days" />
          <Field label="Next visit" hint="optional" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} placeholder="e.g. After 5 days" />
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Log visit'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

type DiscountType = 'none' | 'percent' | 'amount'

function GenerateInvoiceForm({
  treatmentId,
  unpaidTotal,
  generateInvoice,
  viewInvoicePdf,
  onDone,
  onCancel,
}: {
  treatmentId: string
  unpaidTotal: number
  generateInvoice: (
    treatmentId: string,
    paymentMode: PaymentMode | null,
    discount?: { type: 'percent' | 'amount'; value: number } | null,
  ) => Promise<Invoice>
  viewInvoicePdf: (treatmentId: string) => Promise<void>
  onDone: () => void
  onCancel: () => void
}) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [discountType, setDiscountType] = useState<DiscountType>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null)
  const [viewing, setViewing] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)

  const discountAmount = useMemo(() => {
    const value = Number(discountValue)
    if (discountType === 'none' || !value || value <= 0) return 0
    if (discountType === 'percent') return Math.min(unpaidTotal * (Math.min(value, 100) / 100), unpaidTotal)
    return Math.min(value, unpaidTotal)
  }, [discountType, discountValue, unpaidTotal])

  const payable = unpaidTotal - discountAmount

  async function confirm(mode: PaymentMode | null) {
    setSubmitting(true)
    setError(null)
    try {
      const discount =
        discountType === 'none' || !discountValue ? null : { type: discountType, value: Number(discountValue) }
      const invoice = await generateInvoice(treatmentId, mode, discount)
      setGeneratedInvoice(invoice)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the invoice')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleView() {
    setViewing(true)
    setViewError(null)
    try {
      await viewInvoicePdf(treatmentId)
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Failed to open the invoice')
    } finally {
      setViewing(false)
    }
  }

  if (generatedInvoice) {
    return (
      <div className="flex flex-col gap-4 rounded-lg bg-paper-raised p-4">
        <p className="text-body text-ink">
          Invoice generated — <span className="font-medium">{formatINR(generatedInvoice.finalTotal)}</span> via{' '}
          {generatedInvoice.paymentMode.toUpperCase()}.
        </p>
        {viewError && <p className="text-[13px] text-crit">{viewError}</p>}
        <div className="flex gap-3">
          <Button onClick={handleView} disabled={viewing}>
            {viewing ? 'Opening…' : 'View invoice'}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-paper-raised p-4">
      {unpaidTotal > 0 ? (
        <>
          <SelectField
            label="Payment mode"
            options={['cash', 'card', 'upi']}
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            className="w-40"
          />

          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Discount"
              options={['none', 'percent', 'amount']}
              value={discountType}
              onChange={(e) => {
                setDiscountType(e.target.value as DiscountType)
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
                <td className="text-right font-medium text-ink">{formatINR(unpaidTotal)}</td>
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
            <Button onClick={() => confirm(paymentMode)} disabled={submitting}>
              {submitting ? 'Generating…' : `Generate invoice for ${formatINR(payable)}`}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-body text-ink">Nothing outstanding — every visit is already paid.</p>
          {error && <p className="text-[13px] text-crit">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={() => confirm(null)} disabled={submitting}>
              {submitting ? 'Saving…' : 'Mark treatment finished'}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  )
}