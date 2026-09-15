export type PaymentMode = 'cash' | 'card' | 'upi'
export type PaymentStatus = 'paid' | 'unpaid'
export type StaffRole = 'admin' | 'doctor'
export type TreatmentStatus = 'pending' | 'ongoing' | 'finished'
export type ServiceType = 'dental' | 'lab'
export type NextCallStatus = 'upcoming' | 'done'

// Shared input shape for the "set discount"/"set price adjustment" calls —
// see Treatment.priceAdjustmentType and Treatment.discountType for how the
// two combine (adjustment first, then discount on the adjusted price).
// Adjustment is increase-only — decreasing the price is what discount is for.
export type PriceAdjustmentInput = { type: 'percent' | 'amount'; value: number } | null
export type DiscountInput = { type: 'percent' | 'amount'; value: number } | null

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
  // Shown on the prescription PDF letterhead alongside name/specialty.
  registrationNo: string | null
  email: string
  // Bare base64 PNG (no "data:" prefix — callers add that), background
  // already stripped to transparent. Null means this doctor hasn't set one
  // yet, in which case the prescription PDF just omits the signature block.
  signatureImage: string | null
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
  // Checked on the consultation form, shown on that consultation's
  // prescription as "X-ray: Yes" when it is.
  xrayDone: boolean
  rx: RxItem[]
  paymentStatus: PaymentStatus
  paymentMode?: PaymentMode
  paidAt?: string
  recommendedServiceIds: string[]
  recommendationNote?: string
  updatedAt: string
  // Corrects the base fee upward, before any discount below is applied —
  // see Treatment.priceAdjustmentType for the full explanation.
  priceAdjustmentType?: 'percent' | 'amount' | null
  priceAdjustmentValue?: number | null
  // Same discount mechanism as Treatment.discountType/discountValue — a
  // per-service concern that only affects the patient's combined bill.
  // Computed on the already-adjusted fee above, not the raw fee.
  discountType?: 'percent' | 'amount' | null
  discountValue?: number | null
}

export interface Treatment {
  id: string
  patientId: string
  serviceId: string
  doctorId: string
  // Only set on a treatment created the older way, via a consultation's
  // recommended services — null on one added from the Treatments tab.
  consultationId: string | null
  status: TreatmentStatus
  // Null while pending (added but not started yet).
  startedAt: string | null
  completedAt?: string
  // Snapshot of the service's listed price taken when the treatment was
  // added — what this treatment actually contributes to the patient's
  // combined bill is derived from this, never from the service's live
  // catalog price.
  servicePrice: number
  // Corrects the base servicePrice for this one treatment upward — before
  // any discount below is applied. Increase-only: decreasing the price is
  // what discount is for. Unlike discount, this changes the actual agreed
  // price and IS reflected on invoices/generated documents.
  priceAdjustmentType?: 'percent' | 'amount' | null
  priceAdjustmentValue?: number | null
  // Computed off the already-adjusted price above, not the raw
  // servicePrice — never shown on any generated document, a
  // Billing-tab-only concern.
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
  // Human-readable sequential number shown on the invoice PDF as "INV-0001"
  // — the internal `id` above is a UUID and never shown to anyone.
  invoiceNumber: number
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
  addedBy: string
  createdAt: string
  lastEditedAt?: string
  versions: PrescriptionVersion[]
}

// A patient-level "call/see them again on this date" record — a history,
// not a single overwritten field, so every entry ever scheduled stays
// visible alongside whatever's still upcoming. Not tied to any specific
// consultation or treatment.
export interface NextCall {
  id: string
  patientId: string
  scheduledAt: string
  status: NextCallStatus
  addedBy: string
  createdAt: string
  completedAt?: string
}