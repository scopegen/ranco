import { Pill } from './Pill'
import type { PaymentStatus } from '../types/clinical'

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  return status === 'paid' ? <Pill variant="solid">✓ Paid</Pill> : <Pill variant="outline">Unpaid</Pill>
}