import { Link, useOutletContext } from 'react-router-dom'
import { ChevronRight, Pencil } from 'lucide-react'
import { Button } from '../../../components/Button'
import { formatPatientId } from '../../../lib/patientId'
import type { PatientDetailContext } from '../PatientDetail'

// A patient with no consultations yet can't have anything to review on a
// Consultations page, so that link only appears once one exists — the "+ Add
// consultation" button below is how the first one gets created.
export function PatientOverview() {
  const { patient, data, isAdmin } = useOutletContext<PatientDetailContext>()

  const sections = [
    { id: 'timeline', label: 'Timeline' },
    ...(data.consultations.length > 0 ? [{ id: 'consultations', label: 'Consultations' }] : []),
    { id: 'treatments', label: 'Treatments' },
    ...(isAdmin ? [{ id: 'billing', label: 'Billing' }] : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link to="consultations" state={{ openForm: true }}>
          <Button variant="secondary">+ Add consultation</Button>
        </Link>
      </div>

      <div className="flex flex-col gap-2.5">
        {sections.map((section) => (
          <Link
            key={section.id}
            to={section.id}
            className="flex items-center justify-between rounded-xl border border-rule bg-white px-5 py-4 text-left shadow-sm transition-colors hover:bg-paper-raised"
          >
            <span className="text-subheading font-medium text-ink">{section.label}</span>
            <ChevronRight size={18} className="text-ink-faint" />
          </Link>
        ))}
      </div>

      {/* Only on this page (the patient's own overview) — the global "+"
          quick-add button shifts up (see QuickAddMenu) to leave this anchor
          spot free, so this sits directly below it. */}
      <Link
        to={`/admin/patients/${formatPatientId(patient.patientNumber)}/edit`}
        aria-label="Edit patient"
        title="Edit patient"
        className="fixed bottom-20 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-rule bg-white text-accent-deep shadow-[0_10px_22px_-8px_rgba(30,95,140,0.35)] transition-transform duration-150 hover:bg-paper-raised md:bottom-8 md:right-8"
      >
        <Pencil size={20} />
      </Link>
    </div>
  )
}
