import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePatients } from '../../state/PatientsContext'
import { useAuth } from '../../state/AuthContext'
import { useClinic } from '../../state/ClinicContext'
import { clinicalApi } from '../../lib/clinicalApi'
import { formatINR } from '../../lib/currency'
import { formatDate, formatDateTime } from '../../lib/date'
import { formatPatientId } from '../../lib/patientId'
import { PaymentStatusPill } from '../../components/PaymentStatusPill'

interface LedgerLine {
  date: string
  label: string
  sub: string
  amount: number
  kind: 'consultation' | 'invoice'
  paid: boolean
  patientCode: string
  patientName: string
}

export function BillingOverview() {
  const { staff } = useAuth()
  const { patients, loading: patientsLoading } = usePatients()
  const { doctorName, serviceName } = useClinic()
  const [lines, setLines] = useState<LedgerLine[] | null>(null)

  const isAdmin = staff?.role === 'admin'

  useEffect(() => {
    if (patientsLoading || !isAdmin) return
    let cancelled = false

    Promise.all(
      patients.map(async (patient) => {
        const [consultations, treatments, invoices] = await Promise.all([
          clinicalApi.listConsultations(patient.id),
          clinicalApi.listTreatments(patient.id),
          clinicalApi.listInvoices(patient.id),
        ])

        const patientLines: LedgerLine[] = consultations.map((c) => ({
          date: c.consultDate,
          label: 'Consultation',
          sub: doctorName(c.doctorId),
          amount: c.fee,
          kind: 'consultation',
          paid: c.paymentStatus === 'paid',
          patientCode: formatPatientId(patient.patientNumber),
          patientName: patient.name,
        }))

        for (const invoice of invoices) {
          // An invoice can cover several treatments picked together —
          // list each one's service by name.
          const serviceLabels = invoice.lines
            .map((line) => treatments.find((t) => t.id === line.treatmentId)?.serviceId)
            .filter((id): id is string => Boolean(id))
            .map((id) => serviceName(id))
          patientLines.push({
            date: invoice.issuedAt,
            label: `Invoice — ${serviceLabels.join(', ') || `${invoice.lines.length} treatment(s)`}`,
            sub: `settled via ${invoice.paymentMode.toUpperCase()}`,
            amount: invoice.finalTotal,
            kind: 'invoice',
            paid: true,
            patientCode: formatPatientId(patient.patientNumber),
            patientName: patient.name,
          })
        }

        return patientLines
      }),
    ).then((groups) => {
      if (cancelled) return
      setLines(groups.flat().sort((a, b) => b.date.localeCompare(a.date)))
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, patientsLoading, isAdmin])

  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-6 py-16 text-center">
        <h1>Billing</h1>
        <p className="text-ink-soft">Clinic-wide revenue &amp; reporting is Admin only.</p>
      </div>
    )
  }

  const loading = patientsLoading || lines === null
  // Note: this only counts consultation fees and already-invoiced
  // treatments — a treatment's pending balance before it's invoiced isn't
  // reflected here (see each patient's own Billing tab for that).
  const totalBilled = lines?.reduce((sum, l) => sum + l.amount, 0) ?? 0
  const totalCollected = lines?.filter((l) => l.paid).reduce((sum, l) => sum + l.amount, 0) ?? 0
  const outstanding = totalBilled - totalCollected

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1>Billing</h1>
        <p className="text-ink-soft">{loading ? 'Loading…' : 'Clinic-wide, across every patient'}</p>
      </div>

      {!loading && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile label="Total billed" value={formatINR(totalBilled)} />
            <SummaryTile label="Collected" value={formatINR(totalCollected)} accent />
            <SummaryTile label="Outstanding" value={formatINR(outstanding)} />
          </div>

          {lines!.length === 0 ? (
            <p className="text-ink-soft">No billing activity yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {lines!.map((line, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-body font-medium text-ink">{line.label}</span>
                    <span className="text-[12px] text-ink-faint">
                      <Link to={`/admin/patients/${line.patientCode}`} className="hover:text-accent-deep">
                        {line.patientName}
                      </Link>
                      {' · '}
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
          )}
        </>
      )}
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