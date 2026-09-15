import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { clinicalApi } from '../lib/clinicalApi'
import { useAuth } from './AuthContext'
import type {
  BillingHistoryEvent,
  Consultation,
  DiscountInput,
  Invoice,
  NextCall,
  PatientBillingSummary,
  PatientPayment,
  PaymentMode,
  PaymentStatus,
  PrescriptionEntry,
  PriceAdjustmentInput,
  RxItem,
  Service,
  ServiceType,
  Staff,
  Treatment,
  Visit,
} from '../types/clinical'

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

interface ClinicContextValue {
  doctors: Staff[]
  services: Service[]
  loading: boolean

  doctorName: (id: string | undefined) => string
  serviceName: (id: string | undefined) => string

  updateDoctor: (
    id: string,
    input: { name: string; specialty?: string; registrationNo?: string; email: string; password?: string },
  ) => Promise<Staff>
  // imageData: a full data URL, from either a file upload or a drawn
  // signature's canvas export — either way the backend treats it the same.
  setDoctorSignature: (id: string, imageData: string) => Promise<Staff>
  clearDoctorSignature: (id: string) => Promise<Staff>

  addDoctor: (input: {
    name: string
    specialty?: string
    registrationNo?: string
    email: string
    password: string
  }) => Promise<Staff>

  addConsultation: (
    patientId: string,
    input: {
      doctorId: string
      consultDate: string
      fee: number
      chiefComplaint: string
      oralExamination: string
      xrayDone: boolean
      rx: RxItem[]
      paymentStatus: PaymentStatus
      paymentMode?: PaymentMode
      recommendedServiceIds: string[]
      recommendationNote?: string
    },
  ) => Promise<Consultation>
  updateConsultation: (
    patientId: string,
    consultationId: string,
    input: {
      doctorId: string
      consultDate: string
      fee: number
      chiefComplaint: string
      oralExamination: string
      xrayDone: boolean
      rx: RxItem[]
      paymentStatus: PaymentStatus
      paymentMode?: PaymentMode
      recommendedServiceIds: string[]
      recommendationNote?: string
    },
  ) => Promise<Consultation>

  // Same discount mechanism as a treatment's — set on the consultation
  // itself, editable any time regardless of payment status. adjustment is
  // applied to the base fee first, then discount is computed on that
  // adjusted fee — see Consultation.priceAdjustmentType.
  updateConsultationDiscount: (
    consultationId: string,
    adjustment: PriceAdjustmentInput,
    discount: DiscountInput,
  ) => Promise<Consultation>

  // Added straight from the Treatments tab — pending, no consultation, no
  // start date yet.
  addTreatment: (patientId: string, input: { serviceId: string; doctorId: string }) => Promise<Treatment>
  // Moves a pending treatment to ongoing, starting today (or a chosen date).
  startTreatment: (treatmentId: string, input: { startedAt: string }) => Promise<Treatment>

  logVisit: (treatmentId: string, input: { visitDate: string }) => Promise<Visit>

  // One click, ends today.
  endTreatment: (treatmentId: string) => Promise<Treatment>

  // Only allowed while the treatment has no visits logged yet — see the
  // 409s clinicalApi.deleteTreatment can throw.
  deleteTreatment: (treatmentId: string) => Promise<void>

  // Discounts stay a per-service concern — set on the treatment itself.
  // adjustment is applied to the base servicePrice first, then discount is
  // computed on that adjusted price — see Treatment.priceAdjustmentType.
  updateTreatmentDiscount: (
    treatmentId: string,
    adjustment: PriceAdjustmentInput,
    discount: DiscountInput,
  ) => Promise<Treatment>

  // Billing — one combined bill per patient, not linked to any specific
  // consultation or treatment.
  getBillingSummary: (patientId: string) => Promise<PatientBillingSummary>
  addPatientPayment: (
    patientId: string,
    input: { amount: number; paymentMode: PaymentMode; paidAt?: string },
  ) => Promise<PatientPayment>
  listPatientPayments: (patientId: string) => Promise<PatientPayment[]>
  getBillingHistory: (patientId: string) => Promise<BillingHistoryEvent[]>

  generateInvoice: (
    patientId: string,
    treatmentIds: string[],
    consultationIds: string[],
    paymentMode: PaymentMode,
  ) => Promise<Invoice>
  listInvoices: (patientId: string) => Promise<Invoice[]>
  viewInvoicePdf: (invoiceId: string) => Promise<void>
  saveInvoicePdf: (invoiceId: string, filenameHint?: string) => Promise<void>

  addPrescription: (input: {
    patientId: string
    consultationId?: string
    visitId?: string
    diagnosis?: string
    notes: string
    advice?: string
  }) => Promise<PrescriptionEntry>

  editPrescription: (
    entryId: string,
    input: { diagnosis?: string; notes: string; advice?: string },
  ) => Promise<PrescriptionEntry>

  // Next calls — a per-patient history (see NextCall's own doc comment),
  // any staff can add one or mark one done, not admin-only.
  addNextCall: (patientId: string, input: { scheduledAt: string }) => Promise<NextCall>
  completeNextCall: (nextCallId: string) => Promise<NextCall>

  addService: (
    input: { name: string; category?: string | null; serviceType: ServiceType; listedPrice: number; active: boolean },
  ) => Promise<Service>
  updateService: (
    id: string,
    input: { name: string; category?: string | null; serviceType: ServiceType; listedPrice: number; active: boolean },
  ) => Promise<Service>

  viewPrescriptionsPdf: (patientId: string) => Promise<void>
  viewHistoryPdf: (patientId: string) => Promise<void>
  savePrescriptionsPdf: (patientId: string, filenameHint?: string) => Promise<void>
  saveHistoryPdf: (patientId: string, filenameHint?: string) => Promise<void>
  viewPrescriptionPdf: (entryId: string) => Promise<void>
  savePrescriptionPdf: (entryId: string, filenameHint?: string) => Promise<void>
}

const ClinicContext = createContext<ClinicContextValue | null>(null)

export function ClinicProvider({ children }: { children: ReactNode }) {
  const { staff } = useAuth()
  const [doctors, setDoctors] = useState<Staff[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff) return
    setLoading(true)
    Promise.all([clinicalApi.listStaff(), clinicalApi.listServices()])
      .then(([staffList, serviceList]) => {
        setDoctors(staffList.filter((s) => s.role === 'doctor'))
        setServices(serviceList)
      })
      .finally(() => setLoading(false))
  }, [staff])

  const doctorName = (id: string | undefined) => doctors.find((d) => d.id === id)?.name ?? '—'
  const serviceName = (id: string | undefined) => services.find((s) => s.id === id)?.name ?? '—'

  async function addDoctor(input: {
    name: string
    specialty?: string
    registrationNo?: string
    email: string
    password: string
  }) {
    const created = await clinicalApi.createStaff({
      name: input.name,
      specialty: input.specialty,
      registration_no: input.registrationNo,
      email: input.email,
      password: input.password,
      role: 'doctor',
    })
    setDoctors((prev) => [...prev, created])
    return created
  }

  async function updateDoctor(
    id: string,
    input: { name: string; specialty?: string; registrationNo?: string; email: string; password?: string },
  ) {
    const updated = await clinicalApi.updateStaff(id, {
      name: input.name,
      specialty: input.specialty,
      registration_no: input.registrationNo,
      email: input.email,
      password: input.password,
    })
    setDoctors((prev) => prev.map((d) => (d.id === id ? updated : d)))
    return updated
  }

  async function setDoctorSignature(id: string, imageData: string) {
    const updated = await clinicalApi.setStaffSignature(id, imageData)
    setDoctors((prev) => prev.map((d) => (d.id === id ? updated : d)))
    return updated
  }

  async function clearDoctorSignature(id: string) {
    const updated = await clinicalApi.clearStaffSignature(id)
    setDoctors((prev) => prev.map((d) => (d.id === id ? updated : d)))
    return updated
  }

  async function addConsultation(
    patientId: string,
    input: {
      doctorId: string
      consultDate: string
      fee: number
      chiefComplaint: string
      oralExamination: string
      xrayDone: boolean
      rx: RxItem[]
      paymentStatus: PaymentStatus
      paymentMode?: PaymentMode
      recommendedServiceIds: string[]
      recommendationNote?: string
    },
  ) {
    return clinicalApi.createConsultation(patientId, {
      doctor_id: input.doctorId,
      consult_date: input.consultDate,
      fee: input.fee,
      chief_complaint: input.chiefComplaint,
      oral_examination: input.oralExamination,
      xray_done: input.xrayDone,
      rx: input.rx,
      payment_status: input.paymentStatus,
      payment_mode: input.paymentMode,
      recommended_service_ids: input.recommendedServiceIds,
      recommendation_note: input.recommendationNote,
    })
  }

  async function updateConsultation(
    patientId: string,
    consultationId: string,
    input: {
      doctorId: string
      consultDate: string
      fee: number
      chiefComplaint: string
      oralExamination: string
      xrayDone: boolean
      rx: RxItem[]
      paymentStatus: PaymentStatus
      paymentMode?: PaymentMode
      recommendedServiceIds: string[]
      recommendationNote?: string
    },
  ) {
    return clinicalApi.updateConsultation(patientId, consultationId, {
      doctor_id: input.doctorId,
      consult_date: input.consultDate,
      fee: input.fee,
      chief_complaint: input.chiefComplaint,
      oral_examination: input.oralExamination,
      xray_done: input.xrayDone,
      rx: input.rx,
      payment_status: input.paymentStatus,
      payment_mode: input.paymentMode,
      recommended_service_ids: input.recommendedServiceIds,
      recommendation_note: input.recommendationNote,
    })
  }

  async function updateConsultationDiscount(
    consultationId: string,
    adjustment: PriceAdjustmentInput,
    discount: DiscountInput,
  ) {
    return clinicalApi.updateConsultationDiscount(consultationId, {
      price_adjustment_type: adjustment?.type ?? null,
      price_adjustment_value: adjustment?.value ?? null,
      discount_type: discount?.type ?? null,
      discount_value: discount?.value ?? null,
    })
  }

  async function addTreatment(patientId: string, input: { serviceId: string; doctorId: string }) {
    return clinicalApi.addTreatment(patientId, {
      service_id: input.serviceId,
      doctor_id: input.doctorId,
    })
  }

  async function startTreatment(treatmentId: string, input: { startedAt: string }) {
    return clinicalApi.startTreatment(treatmentId, { started_at: input.startedAt })
  }

  async function logVisit(treatmentId: string, input: { visitDate: string }) {
    return clinicalApi.logVisit(treatmentId, { visit_date: input.visitDate })
  }

  async function endTreatment(treatmentId: string) {
    return clinicalApi.endTreatment(treatmentId)
  }

  async function deleteTreatment(treatmentId: string) {
    return clinicalApi.deleteTreatment(treatmentId)
  }

  async function updateTreatmentDiscount(
    treatmentId: string,
    adjustment: PriceAdjustmentInput,
    discount: DiscountInput,
  ) {
    return clinicalApi.updateTreatmentDiscount(treatmentId, {
      price_adjustment_type: adjustment?.type ?? null,
      price_adjustment_value: adjustment?.value ?? null,
      discount_type: discount?.type ?? null,
      discount_value: discount?.value ?? null,
    })
  }

  async function getBillingSummary(patientId: string) {
    return clinicalApi.getBillingSummary(patientId)
  }

  async function addPatientPayment(
    patientId: string,
    input: { amount: number; paymentMode: PaymentMode; paidAt?: string },
  ) {
    return clinicalApi.createPatientPayment(patientId, {
      amount: input.amount,
      payment_mode: input.paymentMode,
      paid_at: input.paidAt,
    })
  }

  async function listPatientPayments(patientId: string) {
    return clinicalApi.listPatientPayments(patientId)
  }

  async function getBillingHistory(patientId: string) {
    return clinicalApi.getBillingHistory(patientId)
  }

  async function generateInvoice(
    patientId: string,
    treatmentIds: string[],
    consultationIds: string[],
    paymentMode: PaymentMode,
  ) {
    return clinicalApi.generateInvoice(patientId, treatmentIds, consultationIds, paymentMode)
  }

  async function listInvoices(patientId: string) {
    return clinicalApi.listInvoices(patientId)
  }

  async function addPrescription(input: {
    patientId: string
    consultationId?: string
    visitId?: string
    diagnosis?: string
    notes: string
    advice?: string
  }) {
    return clinicalApi.createPrescription({
      patient_id: input.patientId,
      consultation_id: input.consultationId,
      visit_id: input.visitId,
      diagnosis: input.diagnosis,
      notes: input.notes,
      advice: input.advice,
    })
  }

  async function editPrescription(entryId: string, input: { diagnosis?: string; notes: string; advice?: string }) {
    return clinicalApi.editPrescription(entryId, {
      diagnosis: input.diagnosis,
      notes: input.notes,
      advice: input.advice,
    })
  }

  async function addNextCall(patientId: string, input: { scheduledAt: string }) {
    return clinicalApi.addNextCall(patientId, { scheduled_at: input.scheduledAt })
  }

  async function completeNextCall(nextCallId: string) {
    return clinicalApi.completeNextCall(nextCallId)
  }

  async function addService(input: {
    name: string
    category?: string | null
    serviceType: ServiceType
    listedPrice: number
    active: boolean
  }) {
    const created = await clinicalApi.createService({
      name: input.name,
      category: input.category ?? undefined,
      service_type: input.serviceType,
      listed_price: input.listedPrice,
      active: input.active,
    })
    setServices((prev) => [...prev, created])
    return created
  }

  async function updateService(
    id: string,
    input: { name: string; category?: string | null; serviceType: ServiceType; listedPrice: number; active: boolean },
  ) {
    const updated = await clinicalApi.updateService(id, {
      name: input.name,
      category: input.category ?? undefined,
      service_type: input.serviceType,
      listed_price: input.listedPrice,
      active: input.active,
    })
    setServices((prev) => prev.map((s) => (s.id === id ? updated : s)))
    return updated
  }

  return (
    <ClinicContext.Provider
      value={{
        doctors,
        services,
        loading,
        doctorName,
        serviceName,
        addDoctor,
        updateDoctor,
        setDoctorSignature,
        clearDoctorSignature,
        addConsultation,
        updateConsultation,
        updateConsultationDiscount,
        addTreatment,
        startTreatment,
        logVisit,
        endTreatment,
        deleteTreatment,
        updateTreatmentDiscount,
        getBillingSummary,
        addPatientPayment,
        listPatientPayments,
        getBillingHistory,
        generateInvoice,
        listInvoices,
        addPrescription,
        editPrescription,
        addNextCall,
        completeNextCall,
        addService,
        updateService,
        viewPrescriptionsPdf: clinicalApi.viewPrescriptionsPdf,
        viewHistoryPdf: clinicalApi.viewHistoryPdf,
        savePrescriptionsPdf: clinicalApi.savePrescriptionsPdf,
        saveHistoryPdf: clinicalApi.saveHistoryPdf,
        viewPrescriptionPdf: clinicalApi.viewPrescriptionPdf,
        savePrescriptionPdf: clinicalApi.savePrescriptionPdf,
        viewInvoicePdf: clinicalApi.viewInvoicePdf,
        saveInvoicePdf: clinicalApi.saveInvoicePdf,
      }}
    >
      {children}
    </ClinicContext.Provider>
  )
}

export function useClinic() {
  const ctx = useContext(ClinicContext)
  if (!ctx) throw new Error('useClinic must be used within ClinicProvider')
  return ctx
}
