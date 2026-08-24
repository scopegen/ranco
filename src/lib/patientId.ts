export function formatPatientId(patientNumber: number): string {
  return `RANCO-${String(patientNumber).padStart(4, '0')}`
}

/** Resolve a patient-code URL segment (e.g. "RANCO-0012", case-insensitive)
 * back to the patient it names — used everywhere a route is keyed by the
 * human-readable code instead of the internal UUID. */
export function findPatientByCode<T extends { patientNumber: number }>(
  patients: T[],
  code: string,
): T | undefined {
  const needle = code.toLowerCase()
  return patients.find((p) => formatPatientId(p.patientNumber).toLowerCase() === needle)
}