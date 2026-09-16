import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { X } from 'lucide-react'
import type { PatientDetailContext } from '../PatientDetail'
import { TimelineTab } from './TimelineTab'
import { ConsultationsTab } from './ConsultationsTab'
import { TreatmentsTab } from './TreatmentsTab'
import { NextCallTab } from './NextCallTab'
import { BillingTab, BillingHistoryModal } from './BillingTab'
import { Button } from '../../../components/Button'

/** Shared chrome for every section's content inside the bottom-sheet overlay
 * (see PatientDetail.tsx) — a title plus a close (X) on the right, since
 * this is a sheet over the patient page now, not a page of its own. */
function SectionShell({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 border-b border-rule pb-4">
        <h2 className="text-subheading font-medium text-ink">{title}</h2>
        <button
          type="button"
          onClick={() => navigate('..', { relative: 'path' })}
          aria-label="Close"
          title="Close"
          className="flex items-center justify-center rounded-full border border-rule bg-white p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
        >
          <X size={16} />
        </button>
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
  const { patient, data, refresh } = useOutletContext<PatientDetailContext>()

  return (
    <SectionShell title="Treatments">
      {/* Prescriptions now live per-visit (view/download buttons next to
          each visit) rather than as one combined document here — each
          visit's prescription is its own separate PDF. */}
      <TreatmentsTab patient={patient} data={data} onChange={refresh} />
    </SectionShell>
  )
}

export function NextCallSection() {
  const { patient, data, refresh } = useOutletContext<PatientDetailContext>()
  return (
    <SectionShell title="Next Call">
      <NextCallTab patient={patient} data={data} onChange={refresh} />
    </SectionShell>
  )
}

export function BillingSection() {
  const { patient, data, refresh, isAdmin } = useOutletContext<PatientDetailContext>()
  const location = useLocation()
  // Set by the FAB's "Add payment" quick action so picking it opens the Add
  // Payment popup straight away — same shortcut Consultations already has
  // for its own form (see openForm above). Passed down as location.key (a
  // fresh value on every navigate() call) rather than a plain boolean — see
  // BillingTab's effect for why.
  const openPayment = Boolean((location.state as { openPayment?: boolean } | null)?.openPayment)
  const [historyOpen, setHistoryOpen] = useState(false)
  if (!isAdmin) return null
  return (
    <SectionShell title="Billing">
      <BillingTab
        patient={patient}
        data={data}
        onChange={refresh}
        openPaymentSignal={openPayment ? location.key : null}
      />
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
          Billing history
        </Button>
      </div>
      {historyOpen && <BillingHistoryModal patientId={patient.id} onClose={() => setHistoryOpen(false)} />}
    </SectionShell>
  )
}
