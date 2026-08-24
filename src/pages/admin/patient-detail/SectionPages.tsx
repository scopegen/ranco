import { useState, type ReactNode } from 'react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { ArrowLeft, Download, Eye } from 'lucide-react'
import type { PatientDetailContext } from '../PatientDetail'
import { TimelineTab } from './TimelineTab'
import { ConsultationsTab } from './ConsultationsTab'
import { TreatmentsTab } from './TreatmentsTab'
import { BillingTab, BillingHistoryModal } from './BillingTab'
import { Button } from '../../../components/Button'

/** Shared page chrome for every section route: a back arrow to the overview
 * (the card list) plus a title, so each section reads like its own page.
 * `headerExtra` renders on the same row, right of the title — used by the
 * Billing section for its "Billing history" trigger. */
function SectionShell({ title, headerExtra, children }: { title: string; headerExtra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 border-b border-rule pb-4">
        <div className="flex items-center gap-2">
          <Link
            to=".."
            relative="path"
            aria-label="Back to sections"
            title="Back"
            className="flex items-center justify-center rounded-full border border-rule bg-white p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
          >
            <ArrowLeft size={16} />
          </Link>
          <h2 className="text-subheading font-medium text-ink">{title}</h2>
        </div>
        {headerExtra}
      </div>
      {children}
    </div>
  )
}

export function TimelineSection() {
  const { patient, data } = useOutletContext<PatientDetailContext>()
  return (
    <SectionShell title="Timeline">
      <TimelineTab patient={patient} data={data} />
    </SectionShell>
  )
}

export function ConsultationsSection() {
  const { patient, data, refresh } = useOutletContext<PatientDetailContext>()
  const location = useLocation()
  // Set by the "+ Add consultation" shortcuts (overview page, quick-add menu)
  // so picking one goes straight into the new-consultation form.
  const openForm = Boolean((location.state as { openForm?: boolean } | null)?.openForm)
  return (
    <SectionShell title="Consultations">
      <ConsultationsTab patient={patient} data={data} onChange={refresh} initialFormOpen={openForm} />
    </SectionShell>
  )
}

export function TreatmentsSection() {
  const { patient, data, refresh, busy, handleViewPrescriptions, handleSavePrescriptions } =
    useOutletContext<PatientDetailContext>()
  const prescriptionsBusy = busy === 'view-prescriptions' || busy === 'save-prescriptions'

  return (
    <SectionShell title="Treatments">
      {/* Prescription actions live only here — a prescription only ever gets
          written once treatment has started. */}
      <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-paper-raised px-3.5 py-2.5">
        <span className="text-body font-medium text-ink">{prescriptionsBusy ? 'Generating…' : 'Prescription'}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleViewPrescriptions}
            disabled={busy !== null}
            aria-label="View prescriptions"
            title="View"
            className="flex items-center justify-center rounded-full p-2 text-ink-soft transition-colors hover:bg-white hover:text-accent-deep disabled:opacity-50"
          >
            <Eye size={18} />
          </button>
          <button
            type="button"
            onClick={handleSavePrescriptions}
            disabled={busy !== null}
            aria-label="Download prescriptions"
            title="Download"
            className="flex items-center justify-center rounded-full p-2 text-ink-soft transition-colors hover:bg-white hover:text-accent-deep disabled:opacity-50"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      <TreatmentsTab patient={patient} data={data} onChange={refresh} />
    </SectionShell>
  )
}

export function BillingSection() {
  const { patient, data, refresh, isAdmin } = useOutletContext<PatientDetailContext>()
  const location = useLocation()
  // Set by the FAB's "Add payment" quick action so picking it opens the Add
  // Payment popup straight away — same shortcut Consultations already has
  // for its own form (see openForm above).
  const openPayment = Boolean((location.state as { openPayment?: boolean } | null)?.openPayment)
  const [historyOpen, setHistoryOpen] = useState(false)
  if (!isAdmin) return null
  return (
    <SectionShell
      title="Billing"
      headerExtra={
        <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
          Billing history
        </Button>
      }
    >
      <BillingTab patient={patient} data={data} onChange={refresh} initialPaymentOpen={openPayment} />
      {historyOpen && <BillingHistoryModal patientId={patient.id} onClose={() => setHistoryOpen(false)} />}
    </SectionShell>
  )
}
