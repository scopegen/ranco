export function formatPatientId(patientNumber: number): string {
  return `RANCO-${String(patientNumber).padStart(4, '0')}`
}