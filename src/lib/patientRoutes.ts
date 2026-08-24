// Shared between AdminLayout (decides whether to hide the global mobile tab
// bar) and QuickAddMenu (which needs to know the same thing, to close the
// gap that bar would otherwise have left behind).
//
// True for a patient's own pages (overview + timeline/consultations/
// treatments/billing sections) — NOT /admin/patients (the list),
// /admin/patients/new, or /admin/patients/:code/edit, which aren't part of
// PatientDetail's nested routes.
export function isPatientDetailPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'admin' || segments[1] !== 'patients') return false
  const code = segments[2]
  if (!code || code === 'new') return false
  if (segments[3] === 'edit') return false
  return true
}
