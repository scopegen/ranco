import { api, savePdf, viewPdf } from './api'
import type { Patient } from '../state/PatientsContext'
import type {
  BillingHistoryEvent,
  Consultation,
  Invoice,
  PatientBillingSummary,
  PatientPayment,
  PaymentMode,
  PaymentStatus,
  PrescriptionEntry,
  Service,
  ServiceType,
  Staff,
  Treatment,
  TreatmentHandoff,
  Visit,
} from '../types/clinical'

// ---- raw backend shapes (snake_case, as FastAPI returns them) ----

interface RawStaff {
  id: string
  name: string
  role: 'admin' | 'doctor'
  specialty: string | null
  email: string
}

interface RawPatient {
  id: string
  patient_number: number
  name: string
  phone: string
  city: string
  sector: string
  dob: string | null
  birth_year: number | null
  email: string | null
  gender: 'male' | 'female' | 'other' | null
  height: number | null
  weight: number | null
  medical_conditions: string[]
  medical_history: string | null
  added_by: string
  registered_at: string
}

interface RawService {
  id: string
  name: string
  category: string | null
  service_type: ServiceType
  listed_price: number
  active: boolean
}

interface RawConsultation {
  id: string
  patient_id: string
  doctor_id: string
  consult_date: string
  fee: number
  findings: string
  payment_status: PaymentStatus
  payment_mode: PaymentMode | null
  paid_at: string | null
  recommended_service_ids: string[]
  recommendation_note: string | null
  updated_at: string
  discount_type: 'percent' | 'amount' | null
  discount_value: number | null
}

interface RawTreatment {
  id: string
  patient_id: string
  service_id: string
  doctor_id: string
  consultation_id: string
  status: 'ongoing' | 'finished'
  started_at: string
  completed_at: string | null
  service_price: number
  discount_type: 'percent' | 'amount' | null
  discount_value: number | null
}

interface RawPatientPayment {
  id: string
  patient_id: string
  amount: number
  payment_mode: PaymentMode
  paid_at: string
  recorded_by: string
}

interface RawPatientBillingSummary {
  total_billed: number
  total_paid: number
  total_outstanding: number
}

interface RawBillingHistoryEvent {
  date: string
  kind: BillingHistoryEvent['kind']
  label: string
  amount: number
  mode: PaymentMode | null
}

interface RawTreatmentHandoff {
  id: string
  treatment_id: string
  from_doctor_id: string
  to_doctor_id: string
  changed_by: string
  changed_at: string
  reason: string | null
}

interface RawVisit {
  id: string
  treatment_id: string
  visit_date: string
  listed_price: number
  discounted_price: number | null
  payment_status: PaymentStatus
  payment_mode: PaymentMode | null
  paid_at: string | null
}

interface RawInvoiceLine {
  treatment_id: string
  amount: number
}

interface RawInvoice {
  id: string
  listed_total: number
  discount_type: 'percent' | 'amount' | null
  discount_value: number | null
  discount_total: number
  final_total: number
  payment_mode: PaymentMode
  issued_at: string
  issued_by: string
  lines: RawInvoiceLine[]
}

interface RawPrescriptionVersion {
  id: string
  notes: string
  edited_by: string
  edited_at: string
  version_number: number
}

interface RawPrescriptionEntry {
  id: string
  patient_id: string
  consultation_id: string | null
  visit_id: string | null
  diagnosis: string | null
  notes: string
  advice: string | null
  next_visit: string | null
  added_by: string
  created_at: string
  last_edited_at: string | null
  versions: RawPrescriptionVersion[]
}

// ---- mappers ----

const toStaff = (r: RawStaff): Staff => ({
  id: r.id,
  name: r.name,
  role: r.role,
  specialty: r.specialty,
  email: r.email,
})

const toPatient = (r: RawPatient): Patient => ({
  id: r.id,
  patientNumber: r.patient_number,
  name: r.name,
  phone: r.phone,
  city: r.city,
  sector: r.sector,
  dob: r.dob,
  birthYear: r.birth_year,
  email: r.email ?? '',
  gender: r.gender,
  height: r.height === null ? '' : String(r.height),
  weight: r.weight === null ? '' : String(r.weight),
  medicalConditions: r.medical_conditions,
  medicalHistory: r.medical_history ?? '',
  registeredAt: r.registered_at,
})

const toService = (r: RawService): Service => ({
  id: r.id,
  name: r.name,
  category: r.category,
  serviceType: r.service_type,
  listedPrice: r.listed_price,
  active: r.active,
})

const toConsultation = (r: RawConsultation): Consultation => ({
  id: r.id,
  patientId: r.patient_id,
  doctorId: r.doctor_id,
  consultDate: r.consult_date,
  fee: r.fee,
  findings: r.findings,
  paymentStatus: r.payment_status,
  paymentMode: r.payment_mode ?? undefined,
  paidAt: r.paid_at ?? undefined,
  recommendedServiceIds: r.recommended_service_ids,
  recommendationNote: r.recommendation_note ?? undefined,
  updatedAt: r.updated_at,
  discountType: r.discount_type,
  discountValue: r.discount_value,
})

const toTreatment = (r: RawTreatment): Treatment => ({
  id: r.id,
  patientId: r.patient_id,
  serviceId: r.service_id,
  doctorId: r.doctor_id,
  consultationId: r.consultation_id,
  status: r.status,
  startedAt: r.started_at,
  completedAt: r.completed_at ?? undefined,
  servicePrice: r.service_price,
  discountType: r.discount_type,
  discountValue: r.discount_value,
})

const toPatientPayment = (r: RawPatientPayment): PatientPayment => ({
  id: r.id,
  patientId: r.patient_id,
  amount: r.amount,
  paymentMode: r.payment_mode,
  paidAt: r.paid_at,
  recordedBy: r.recorded_by,
})

const toBillingSummary = (r: RawPatientBillingSummary): PatientBillingSummary => ({
  totalBilled: r.total_billed,
  totalPaid: r.total_paid,
  totalOutstanding: r.total_outstanding,
})

const toBillingHistoryEvent = (r: RawBillingHistoryEvent): BillingHistoryEvent => ({
  date: r.date,
  kind: r.kind,
  label: r.label,
  amount: r.amount,
  mode: r.mode ?? undefined,
})

const toHandoff = (r: RawTreatmentHandoff): TreatmentHandoff => ({
  id: r.id,
  treatmentId: r.treatment_id,
  fromDoctorId: r.from_doctor_id,
  toDoctorId: r.to_doctor_id,
  changedBy: r.changed_by,
  changedAt: r.changed_at,
  reason: r.reason ?? undefined,
})

const toVisit = (r: RawVisit): Visit => ({
  id: r.id,
  treatmentId: r.treatment_id,
  visitDate: r.visit_date,
  listedPrice: r.listed_price,
  discountedPrice: r.discounted_price ?? undefined,
  paymentStatus: r.payment_status,
  paymentMode: r.payment_mode ?? undefined,
  paidAt: r.paid_at ?? undefined,
})

const toInvoice = (r: RawInvoice): Invoice => ({
  id: r.id,
  listedTotal: r.listed_total,
  discountType: r.discount_type,
  discountValue: r.discount_value,
  discountTotal: r.discount_total,
  finalTotal: r.final_total,
  paymentMode: r.payment_mode,
  issuedAt: r.issued_at,
  issuedBy: r.issued_by,
  lines: r.lines.map((l) => ({ treatmentId: l.treatment_id, amount: l.amount })),
})

const toPrescriptionEntry = (r: RawPrescriptionEntry): PrescriptionEntry => ({
  id: r.id,
  patientId: r.patient_id,
  consultationId: r.consultation_id ?? undefined,
  visitId: r.visit_id ?? undefined,
  diagnosis: r.diagnosis ?? undefined,
  notes: r.notes,
  advice: r.advice ?? undefined,
  nextVisit: r.next_visit ?? undefined,
  addedBy: r.added_by,
  createdAt: r.created_at,
  lastEditedAt: r.last_edited_at ?? undefined,
  versions: r.versions.map((v) => ({
    id: v.id,
    notes: v.notes,
    editedBy: v.edited_by,
    editedAt: v.edited_at,
    versionNumber: v.version_number,
  })),
})

// ---- API calls ----

export const clinicalApi = {
  // staff
  listStaff: () => api.get<RawStaff[]>('/staff').then((rs) => rs.map(toStaff)),
  createStaff: (input: { name: string; role: 'admin' | 'doctor'; specialty?: string; email: string; password: string }) =>
    api.post<RawStaff>('/staff', input).then(toStaff),

  // patients
  listPatients: () => api.get<RawPatient[]>('/patients').then((rs) => rs.map(toPatient)),
  listMedicalConditions: () => api.get<string[]>('/patients/medical-conditions'),
  listSectors: () => api.get<string[]>('/patients/sectors'),
  createPatient: (input: {
    name: string
    phone: string
    city: string
    sector: string
    dob?: string
    birth_year?: number
    email?: string
    gender?: 'male' | 'female' | 'other'
    height?: number
    weight?: number
    medical_conditions: string[]
    medical_history?: string
  }) => api.post<RawPatient>('/patients', input).then(toPatient),
  getPatient: (id: string) => api.get<RawPatient>(`/patients/${id}`).then(toPatient),
  updatePatient: (
    id: string,
    input: {
      name: string
      phone: string
      city: string
      sector: string
      dob?: string
      birth_year?: number
      email?: string
      gender?: 'male' | 'female' | 'other'
      height?: number
      weight?: number
      medical_conditions: string[]
      medical_history?: string
    },
  ) => api.patch<RawPatient>(`/patients/${id}`, input).then(toPatient),

  // services
  listServices: () => api.get<RawService[]>('/services').then((rs) => rs.map(toService)),
  createService: (input: { name: string; category?: string; service_type: ServiceType; listed_price: number; active: boolean }) =>
    api.post<RawService>('/services', input).then(toService),
  updateService: (
    id: string,
    input: { name: string; category?: string; service_type: ServiceType; listed_price: number; active: boolean },
  ) => api.patch<RawService>(`/services/${id}`, input).then(toService),

  // consultations
  listConsultations: (patientId: string) =>
    api.get<RawConsultation[]>(`/patients/${patientId}/consultations`).then((rs) => rs.map(toConsultation)),
  createConsultation: (
    patientId: string,
    input: {
      doctor_id: string
      consult_date: string
      fee: number
      findings: string
      payment_status: PaymentStatus
      payment_mode?: PaymentMode
      recommended_service_ids: string[]
      recommendation_note?: string
    },
  ) => api.post<RawConsultation>(`/patients/${patientId}/consultations`, input).then(toConsultation),
  updateConsultation: (
    patientId: string,
    consultationId: string,
    input: {
      doctor_id: string
      consult_date: string
      fee: number
      findings: string
      payment_status: PaymentStatus
      payment_mode?: PaymentMode
      recommended_service_ids: string[]
      recommendation_note?: string
    },
  ) =>
    api
      .patch<RawConsultation>(`/patients/${patientId}/consultations/${consultationId}`, input)
      .then(toConsultation),
  // Discounts stay a per-service concern even though payment is tracked on
  // the patient's combined bill — same mechanism as a treatment's discount.
  updateConsultationDiscount: (
    consultationId: string,
    input: { discount_type: 'percent' | 'amount' | null; discount_value: number | null },
  ) => api.patch<RawConsultation>(`/consultations/${consultationId}/discount`, input).then(toConsultation),

  // treatments
  listTreatments: (patientId: string) =>
    api.get<RawTreatment[]>(`/patients/${patientId}/treatments`).then((rs) => rs.map(toTreatment)),
  startTreatment: (
    consultationId: string,
    input: { consultation_id: string; service_id: string; doctor_id: string; started_at: string },
  ) => api.post<RawTreatment>(`/consultations/${consultationId}/treatments`, input).then(toTreatment),
  handoffTreatment: (treatmentId: string, input: { to_doctor_id: string; reason?: string }) =>
    api.post<RawTreatmentHandoff>(`/treatments/${treatmentId}/handoff`, input).then(toHandoff),
  // Discounts stay a per-service concern even though payment is now
  // tracked on the patient's combined bill, not per-treatment.
  updateTreatmentDiscount: (
    treatmentId: string,
    input: { discount_type: 'percent' | 'amount' | null; discount_value: number | null },
  ) => api.patch<RawTreatment>(`/treatments/${treatmentId}/discount`, input).then(toTreatment),
  // One click, ends today — no request body, no confirmation form.
  endTreatment: (treatmentId: string) => api.post<RawTreatment>(`/treatments/${treatmentId}/end`).then(toTreatment),

  // visits
  listVisits: (treatmentId: string) =>
    api.get<RawVisit[]>(`/treatments/${treatmentId}/visits`).then((rs) => rs.map(toVisit)),
  logVisit: (treatmentId: string, input: { visit_date: string }) =>
    api.post<RawVisit>(`/treatments/${treatmentId}/visits`, input).then(toVisit),

  // invoices — one invoice can cover several treatments picked together;
  // always at full listed price, no discount (see GenerateInvoiceRequest)
  generateInvoice: (patientId: string, treatmentIds: string[], paymentMode: PaymentMode) =>
    api
      .post<RawInvoice>(`/patients/${patientId}/invoices`, {
        treatment_ids: treatmentIds,
        payment_mode: paymentMode,
      })
      .then(toInvoice),
  listInvoices: (patientId: string) =>
    api.get<RawInvoice[]>(`/patients/${patientId}/invoices`).then((rs) => rs.map(toInvoice)),

  // billing — one combined bill per patient
  getBillingSummary: (patientId: string) =>
    api.get<RawPatientBillingSummary>(`/patients/${patientId}/billing-summary`).then(toBillingSummary),
  createPatientPayment: (patientId: string, input: { amount: number; payment_mode: PaymentMode; paid_at?: string }) =>
    api.post<RawPatientPayment>(`/patients/${patientId}/payments`, input).then(toPatientPayment),
  listPatientPayments: (patientId: string) =>
    api.get<RawPatientPayment[]>(`/patients/${patientId}/payments`).then((rs) => rs.map(toPatientPayment)),
  getBillingHistory: (patientId: string) =>
    api.get<RawBillingHistoryEvent[]>(`/patients/${patientId}/billing-history`).then((rs) => rs.map(toBillingHistoryEvent)),
  viewInvoicePdf: (invoiceId: string) => viewPdf(`/invoices/${invoiceId}/pdf`),

  // prescriptions
  listPrescriptionsForPatient: (patientId: string) =>
    api.get<RawPrescriptionEntry[]>(`/prescriptions/patients/${patientId}`).then((rs) => rs.map(toPrescriptionEntry)),
  createPrescription: (input: {
    patient_id: string
    consultation_id?: string
    visit_id?: string
    diagnosis?: string
    notes: string
    advice?: string
    next_visit?: string
  }) => api.post<RawPrescriptionEntry>('/prescriptions', input).then(toPrescriptionEntry),
  editPrescription: (
    entryId: string,
    input: { diagnosis?: string; notes: string; advice?: string; next_visit?: string },
  ) => api.patch<RawPrescriptionEntry>(`/prescriptions/${entryId}`, input).then(toPrescriptionEntry),

  // documents
  viewPrescriptionsPdf: (patientId: string) => viewPdf(`/patients/${patientId}/prescriptions/pdf`),
  viewHistoryPdf: (patientId: string) => viewPdf(`/patients/${patientId}/history/pdf`),
  savePrescriptionsPdf: (patientId: string, filenameHint?: string) =>
    savePdf(`/patients/${patientId}/prescriptions/pdf`, filenameHint),
  saveHistoryPdf: (patientId: string, filenameHint?: string) => savePdf(`/patients/${patientId}/history/pdf`, filenameHint),
}