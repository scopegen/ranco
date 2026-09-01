import { useEffect, useRef, useState } from 'react'
import { useNavigate, useMatch, useLocation, Link } from 'react-router-dom'
import { CreditCard, Plus, Stethoscope, UserPlus } from 'lucide-react'
import { PatientPicker } from './PatientPicker'
import { usePatients, type Patient } from '../state/PatientsContext'
import { findPatientByCode, formatPatientId } from '../lib/patientId'
import { isPatientDetailPath } from '../lib/patientRoutes'

type PickerMode = 'payment' | 'consultation' | null
type Section = 'billing' | 'consultations'

/** Floating "+" present on every admin page — hover reveals the three quick
 * actions on desktop (pure CSS, via `group`); a click toggles the same menu
 * open/closed, which is what actually drives it on touch devices (no real
 * hover there). Add Payment / Add Consultation need a patient — if you're
 * already viewing one (any of their pages), it's used directly; otherwise
 * the shared picker asks which patient first. */
export function QuickAddMenu() {
  const navigate = useNavigate()
  const { patients } = usePatients()
  // Matches the current patient's own pages regardless of where this
  // component sits in the tree — useMatch reads the current location, not
  // route ancestry, so it works even though QuickAddMenu is a sibling of
  // <Outlet/>, not nested inside it. ":code" also matches "new" (the add-
  // patient route) and "edit" segments, but findPatientByCode below simply
  // won't resolve those to a real patient, so it falls back to the picker.
  const patientMatch = useMatch('/admin/patients/:code/*')
  const currentPatient = patientMatch ? findPatientByCode(patients, patientMatch.params.code!) : undefined
  // The patient overview page has its own "edit patient" button sitting
  // directly below this one (in that anchor spot) — shift up to make room,
  // only on that exact page.
  const onPatientOverview = useMatch('/admin/patients/:code')
  // AdminLayout hides the global mobile tab bar on a patient's own pages —
  // when it's gone, this menu no longer needs the extra clearance that was
  // reserved for it.
  const { pathname } = useLocation()
  const navHidden = isPatientDetailPath(pathname)

  const [open, setOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<PickerMode>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // The add-patient form has its own "Add Patient" submit button right
  // there — this menu's quick actions (Add consultation/payment, and its
  // own "Add patient" link) are redundant on this exact page, and its
  // reserved pop-up space sits right over the bottom of that form. Simplest
  // fix: don't render it here at all rather than repositioning around it.
  if (pathname === '/admin/patients/new') return null

  function goToSection(patient: Patient, section: Section) {
    const code = formatPatientId(patient.patientNumber)
    setPickerMode(null)
    setOpen(false)
    // Both quick actions land straight in the relevant popup, not just the
    // section page — Consultations opens the new-consultation form, Billing
    // opens the Add Payment modal. Same "one click to start" shortcut as the
    // Patients overview's own "+ Add consultation" button.
    const state = section === 'consultations' ? { openForm: true } : { openPayment: true }
    navigate(`/admin/patients/${code}/${section}`, { state })
  }

  function handleQuickAction(mode: Exclude<PickerMode, null>) {
    const section: Section = mode === 'payment' ? 'billing' : 'consultations'
    if (currentPatient) {
      goToSection(currentPatient, section)
    } else {
      setPickerMode(mode)
    }
  }

  function handlePatientSelected(patient: Patient) {
    goToSection(patient, pickerMode === 'payment' ? 'billing' : 'consultations')
  }

  return (
    <>
      <div
        ref={ref}
        className={`group fixed right-5 z-20 flex flex-col items-end gap-2 md:right-8 ${
          onPatientOverview
            ? navHidden
              ? 'bottom-24 md:bottom-[6.25rem]'
              : 'bottom-[9.25rem] md:bottom-[6.25rem]'
            : navHidden
              ? 'bottom-5 md:bottom-8'
              : 'bottom-20 md:bottom-8'
        }`}
      >
        <div
          className={`flex flex-col items-end gap-2 transition-all duration-150 ${
            open
              ? 'opacity-100 visible translate-y-0'
              : // Hover-to-reveal only above the md breakpoint — mobile browsers
                // simulate :hover on tap, and this wrapper stays the same size
                // (invisible, not hidden) even closed, so an unscoped
                // group-hover would pop the menu open from a tap anywhere
                // nearby, not just the + button itself. Below md, the button's
                // own onClick toggle (below) is the only way to open it.
                'opacity-0 invisible translate-y-1 md:group-hover:opacity-100 md:group-hover:visible md:group-hover:translate-y-0'
          }`}
        >
          <QuickAddOption label="Add consultation" icon={Stethoscope} onClick={() => handleQuickAction('consultation')} />
          <QuickAddOption label="Add payment" icon={CreditCard} onClick={() => handleQuickAction('payment')} />
          {/* Doesn't make sense while already inside a specific patient's own
              pages — you're not going to start a whole new patient from in
              here, so it's dropped for that whole area, not just this page. */}
          {!currentPatient && (
            <Link
              to="/admin/patients/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-full border border-rule bg-white py-2 pl-4 pr-2 text-body font-medium text-ink shadow-lg transition-colors hover:bg-paper-raised"
            >
              Add patient
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-deep">
                <UserPlus size={16} />
              </span>
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Quick add"
          aria-expanded={open}
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_22px_-8px_rgba(30,95,140,0.55)] transition-transform duration-150 hover:bg-accent-hover ${
            open ? 'rotate-45' : ''
          }`}
        >
          <Plus size={24} />
        </button>
      </div>

      {pickerMode && (
        <PatientPicker
          title={pickerMode === 'payment' ? 'Add payment for…' : 'Add consultation for…'}
          onSelect={handlePatientSelected}
          onClose={() => setPickerMode(null)}
        />
      )}
    </>
  )
}

function QuickAddOption({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: typeof Stethoscope
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-full border border-rule bg-white py-2 pl-4 pr-2 text-body font-medium text-ink shadow-lg transition-colors hover:bg-paper-raised"
    >
      {label}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-deep">
        <Icon size={16} />
      </span>
    </button>
  )
}
