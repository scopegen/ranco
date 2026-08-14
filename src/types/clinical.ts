export type PaymentMode = 'cash' | 'card' | 'upi'
export type PaymentStatus = 'paid' | 'unpaid'
export type StaffRole = 'admin' | 'doctor'
export type TreatmentStatus = 'ongoing' | 'finished'

export const CONSULTATION_FEE = 500
export const PAYMENT_MODES: PaymentMode[] = ['cash', 'card', 'upi']

export interface Staff {
  id: string
  name: string
  role: StaffRole
  specialty: string | null
  email: string
}

export interface Service {
  id: string
  name: string
  category: string | null
  listedPrice: number
  active: boolean
}

export interface Consultation {
  id: string
  patientId: string
  doctorId: string
  consultDate: string
  fee: number
  findings: string
  paymentStatus: PaymentStatus
  paymentMode?: PaymentMode
  recommendedServiceId?: string
  updatedAt: string
}

export interface Treatment {
  id: string
  patientId: string
  serviceId: string
  doctorId: string
  consultationId: string
  status: TreatmentStatus
  startedAt: string
  completedAt?: string
}

export interface TreatmentHandoff {
  id: string
  treatmentId: string
  fromDoctorId: string
  toDoctorId: string
  changedBy: string
  changedAt: string
  reason?: string
}

export interface Visit {
  id: string
  treatmentId: string
  visitDate: string
  listedPrice: number
  discountedPrice?: number
  paymentStatus: PaymentStatus
  paymentMode?: PaymentMode
  paidAt?: string
}

export interface Invoice {
  id: string
  treatmentId: string
  listedTotal: number
  discountType: 'percent' | 'amount' | null
  discountValue: number | null
  discountTotal: number
  finalTotal: number
  paymentMode: PaymentMode
  issuedAt: string
  issuedBy: string
}

export interface PrescriptionVersion {
  id: string
  notes: string
  editedBy: string
  editedAt: string
  versionNumber: number
}

export interface PrescriptionEntry {
  id: string
  patientId: string
  consultationId?: string
  visitId?: string
  diagnosis?: string
  notes: string
  advice?: string
  nextVisit?: string
  addedBy: string
  createdAt: string
  lastEditedAt?: string
  versions: PrescriptionVersion[]
}

export function visitAmount(visit: Visit): number {
  return visit.discountedPrice ?? visit.listedPrice
}