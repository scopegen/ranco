import { useEffect, useRef, useState } from 'react'
import { useNavigate, useMatch, useLocation, Link } from 'react-router-dom'
import { CreditCard, Plus, Stethoscope, UserPlus, X } from 'lucide-react'
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
  // AdminLayout hides the global mobile tab bar on a patient's own pages —
  // when it's gone, this menu no longer needs the extra clearance that was
  // reserved for it.
  const { pathname } = useLocation()
  const navHidden = isPatientDetailPath(pathname)

  const [open, setOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<PickerMode>(null)
  const ref = useRef<HTMLDivElement>(null)
  // The mobile sheet below has to stay a sibling of `ref`'s div, not nested
  // inside it — that div is `-translate-x-1/2`-positioned on mobile, and any
  // transformed ancestor becomes the containing block for `position: fixed`
  // descendants, which broke the sheet (it sized against that 56px button
  // box instead of the viewport). So it gets its own ref instead, checked
  // alongside `ref` below — a click inside either counts as "not outside".
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (sheetRef.current?.contains(target)) return
      setOpen(false)
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
      // Close the sheet/popup first — PatientPicker is its own full-screen
      // overlay (same z-30), and left open together the sheet's panel (z-40)
      // sat on top of it, hiding the very picker this was supposed to open.
      setOpen(false)
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
        // Mobile: sits between the two bottom-tab-bar items, poking up out of
        // it (classic center-FAB-in-a-tab-bar), rather than the bar's own
        // corner — but only where that bar actually shows (navHidden is true
        // on every patient page, which hides it; there it keeps the old
        // corner spot). Desktop never has that bar, so it's always the
        // bottom-right corner there regardless of navHidden.
        className={`group fixed z-20 md:bottom-8 md:left-auto md:right-8 md:translate-x-0 ${
          navHidden ? 'bottom-5 right-5' : 'bottom-1 left-1/2 -translate-x-1/2'
        }`}
      >
        {/* Desktop only now — mobile gets the full bottom sheet below
            instead (see the `open &&` block right after this div). Still
            absolutely positioned over the button rather than stacked above
            it in normal flow — kept out of the group div's own box so its
            (invisible-but-still-there-until-hover) footprint can't extend
            the hoverable area above the visible circle. That was the glitch:
            hovering that dead space above the + button used to open the menu
            too, not just the button itself. */}
        <div
          className={`absolute bottom-full right-0 mb-2 hidden flex-col items-end gap-2 transition-all duration-150 md:flex ${
            open
              ? 'opacity-100 visible translate-y-0'
              : 'opacity-0 invisible translate-y-1 md:group-hover:opacity-100 md:group-hover:visible md:group-hover:translate-y-0'
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
              className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-rule bg-white py-2 pl-4 pr-2 text-body font-medium text-ink shadow-lg transition-colors hover:bg-paper-raised"
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
          <Plus size={24} className="ml-1" />
        </button>
      </div>

      {/* Mobile only — same bottom-sheet-over-a-backdrop pattern as the
          patient-detail section cards (see PatientDetail.tsx), instead of
          the small hover-popup desktop still uses above. A sibling of the
          div above, not nested inside it — that div is transformed
          (-translate-x-1/2) on mobile, and a transformed ancestor becomes
          the containing block for position:fixed descendants, which breaks
          full-viewport sheets nested inside it. Has its own ref (sheetRef)
          instead, so the "click outside" listener above still recognizes
          taps inside it as not-outside. */}
      {open && (
        <div ref={sheetRef} className="fixed inset-0 z-30 md:hidden">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl bg-paper p-6 shadow-[0_-8px_30px_-8px_rgba(16,24,38,0.35)] [animation:sheet-slide-up_0.22s_ease-out]">
            <div className="flex items-center justify-between gap-3 border-b border-rule pb-4">
              <h2 className="text-subheading font-medium text-ink">Quick add</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                title="Close"
                className="flex items-center justify-center rounded-full border border-rule bg-white p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-3 pt-4">
              <QuickAddRow label="Add consultation" icon={Stethoscope} onClick={() => handleQuickAction('consultation')} />
              <QuickAddRow label="Add payment" icon={CreditCard} onClick={() => handleQuickAction('payment')} />
              {!currentPatient && (
                <Link
                  to="/admin/patients/new"
                  onClick={() => setOpen(false)}
                  className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-rule bg-white px-3 py-4 text-center shadow-sm transition-colors hover:bg-paper-raised"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-deep">
                    <UserPlus size={18} />
                  </span>
                  <span className="text-[13px] font-medium text-ink">Add patient</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

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
      className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-rule bg-white py-2 pl-4 pr-2 text-body font-medium text-ink shadow-lg transition-colors hover:bg-paper-raised"
    >
      {label}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-deep">
        <Icon size={16} />
      </span>
    </button>
  )
}

/** Same idea as QuickAddOption, styled as one of three side-by-side blocks
 * (icon above, label below) instead of a pill — for the mobile bottom
 * sheet, which lays these out in a row rather than stacking pills above a
 * corner button. */
function QuickAddRow({
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
      className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-rule bg-white px-3 py-4 text-center shadow-sm transition-colors hover:bg-paper-raised"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-deep">
        <Icon size={18} />
      </span>
      <span className="text-[13px] font-medium text-ink">{label}</span>
    </button>
  )
}
