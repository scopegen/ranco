import type { RxItem } from '../types/clinical'

/** RxItem rows -> the plain-text, one-medicine-per-line format the backend's
 * PrescriptionEntry.notes (and its PDF rendering) already expects — shared
 * by every place a prescription gets written (consultations, visits). */
export function formatRx(rx: RxItem[]): string {
  return rx
    .filter((item) => item.medicine.trim() !== '')
    .map((item) => `${item.medicine.trim()} — ${item.frequency}`)
    .join('\n')
}
