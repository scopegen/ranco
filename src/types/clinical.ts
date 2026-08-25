export type PaymentMode = 'cash' | 'card' | 'upi'
export type PaymentStatus = 'paid' | 'unpaid'
export type StaffRole = 'admin' | 'doctor'
export type TreatmentStatus = 'ongoing' | 'finished'
export type ServiceType = 'dental' | 'lab'

export const CONSULTATION_FEE = 500
export const PAYMENT_MODES: PaymentMode[] = ['cash', 'card', 'upi']
// Standard dosing-frequency shorthand — doesn't need to be exhaustive, a
// free-typed medicine name sits next to it so anything unusual still fits.
export const RX_FREQUENCIES = ['OD', 'BD', 'TDS', 'QID', 'SOS', 'HS', 'STAT'] as const

export interface RxItem {
  medicine: string
  frequency: string
}

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
  serviceType: ServiceType
  listedPrice: number
  active: boolean
}

export interface Consultation {
  id: string
  patientId: string
  doctorId: string
  consultDate: string
  fee: number
  chiefComplaint: string
  oralExamination: string
  rx: RxItem[]
  paymentStatus: PaymentStatus
  paymentMode?: PaymentMode
  paidAt?: string
  recommendedServiceIds: string[]
  recommendationNote?: string
  updatedAt: string
  // Same discount mechanism as Treatment.discountType/discountValue — a
  // per-service concern that only affects the patient's combined bill.
  discountType?: 'percent' | 'amount' | null
  discountValue?: number | null
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
  // Snapshot of the service's listed price taken when the treatment started
  // — what this treatment actually contributes to the patient's combined
  // bill is derived from this, never from the service's live catalog price.
  servicePrice: number
  discountType?: 'percent' | 'amount' | null
  discountValue?: number | null
}

// One payment against a patient's single combined bill (every consultation
// fee + every treatment's charge, added up) — not linked to any specific
// consultation or treatment.
export interface PatientPayment {
  id: string
  patientId: string
  amount: number
  paymentMode: PaymentMode
  paidAt: string
  recordedBy: string
}

export interface PatientBillingSummary {
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
}

export type BillingHistoryEventKind =
  | 'consultation_billed'
  | 'consultation_paid'
  | 'treatment_billed'
  | 'payment'
  | 'invoice'

export interface BillingHistoryEvent {
  date: string
  kind: BillingHistoryEventKind
  label: string
  amount: number
  mode?: PaymentMode
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
  // Visits no longer carry pricing — a treatment is billed once, as a whole
  // (see TreatmentBilling/TreatmentPayment). Kept optional only so old
  // records (from before this change) still render correctly.
  listedPrice?: number
  discountedPrice?: number
  paymentStatus: PaymentStatus
  paymentMode?: PaymentMode
  paidAt?: string
}

export interface InvoiceLine {
  treatmentId: string | null
  consultationId: string | null
  amount: number
}

// One invoice can cover several treatments picked together — see `lines`.
export interface Invoice {
  id: string
  listedTotal: number
  discountType: 'percent' | 'amount' | null
  discountValue: number | null
  discountTotal: number
  finalTotal: number
  paymentMode: PaymentMode
  issuedAt: string
  issuedBy: string
  lines: InvoiceLine[]
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