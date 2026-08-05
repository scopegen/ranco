import { useClinic } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { formatDate, formatDateTime } from '../../../lib/date'
import { PaymentStatusPill } from '../../../components/PaymentStatusPill'
import { visitAmount } from '../../../types/clinical'
import type { PatientClinicalData } from '../PatientDetail'

interface LedgerLine {
  date: string
  label: string
  sub: string
  amount: number
  kind: 'consultation' | 'visit' | 'invoice'
  paid: boolean
}

export function BillingTab({ data }: { data: PatientClinicalData }) {
  const { doctorName, serviceName } = useClinic()
  const lines: LedgerLine[] = []

  for (const consultation of data.consultations) {
    lines.push({
      date: consultation.consultDate,
      label: 'Consultation',
      sub: doctorName(consultation.doctorId),
      amount: consultation.fee,
      kind: 'consultation',
      paid: consultation.paymentStatus === 'paid',
    })
  }

  let totalBilled = data.consultations.reduce((sum, c) => sum + c.fee, 0)
  let totalCollected = data.consultations.filter((c) => c.paymentStatus === 'paid').reduce((sum, c) => sum + c.fee, 0)

  for (const treatment of data.treatments) {
    const serviceLabel = serviceName(treatment.serviceId)
    for (const visit of data.visitsByTreatment[treatment.id] ?? []) {
      const amount = visitAmount(visit)
      lines.push({
        date: visit.visitDate,
        label: `Visit — ${serviceLabel}`,
        sub: doctorName(treatment.doctorId),
        amount,
        kind: 'visit',
        paid: visit.paymentStatus === 'paid',
      })
      totalBilled += amount
      if (visit.paymentStatus === 'paid') totalCollected += amount
    }

    const invoice = data.invoiceByTreatment[treatment.id]
    if (invoice) {
      // Informational only — the visits it settled are already counted as
      // paid above, so this must NOT add to totalCollected or it double-counts.
      lines.push({
        date: invoice.issuedAt,
        label: `Invoice — ${serviceLabel}`,
        sub: `settled via ${invoice.paymentMode.toUpperCase()}`,
        amount: invoice.finalTotal,
        kind: 'invoice',
        paid: true,
      })
    }
  }

  lines.sort((a, b) => b.date.localeCompare(a.date))
  const outstanding = totalBilled - totalCollected

  if (lines.length === 0) {
    return <p className="text-ink-soft">No billing activity yet.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Total billed" value={formatINR(totalBilled)} />
        <SummaryTile label="Collected" value={formatINR(totalCollected)} accent />
        <SummaryTile label="Outstanding" value={formatINR(outstanding)} />
      </div>

      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-body font-medium text-ink">{line.label}</span>
              <span className="text-[12px] text-ink-faint">
                {line.sub} · {line.kind === 'invoice' ? formatDateTime(line.date) : formatDate(line.date)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium text-ink">{formatINR(line.amount)}</span>
              {line.kind === 'invoice' ? (
                <span className="text-[12px] text-ink-faint">settlement</span>
              ) : (
                <PaymentStatusPill status={line.paid ? 'paid' : 'unpaid'} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
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