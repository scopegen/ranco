import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { clinicalApi } from '../lib/clinicalApi'
import { useAuth } from './AuthContext'
import type {
  BillingHistoryEvent,
  Consultation,
  Invoice,
  PatientBillingSummary,
  PatientPayment,
  PaymentMode,
  PaymentStatus,
  PrescriptionEntry,
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
      rx: RxItem[]
      paymentStatus: PaymentStatus
      paymentMode?: PaymentMode
      recommendedServiceIds: string[]
      recommendationNote?: string
    },
  ) => Promise<Consultation>

  // Same discount mechanism as a treatment's — set on the consultation
  // itself, editable any time regardless of payment status.
  updateConsultationDiscount: (
    consultationId: string,
    discount: { type: 'percent' | 'amount'; value: number } | null,
  ) => Promise<Consultation>

  startTreatment: (
    consultationId: string,
    input: { serviceId: string; doctorId: string; startedAt: string },
  ) => Promise<Treatment>

  logVisit: (treatmentId: string, input: { visitDate: string }) => Promise<Visit>

  // One click, ends today.
  endTreatment: (treatmentId: string) => Promise<Treatment>

  // Only allowed while the treatment has no visits logged yet — see the
  // 409s clinicalApi.deleteTreatment can throw.
  deleteTreatment: (treatmentId: string) => Promise<void>

  // Discounts stay a per-service concern — set on the treatment itself.
  updateTreatmentDiscount: (
    treatmentId: string,
    discount: { type: 'percent' | 'amount'; value: number } | null,
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

  addPrescription: (input: {
    patientId: string
    consultationId?: string
    visitId?: string
    diagnosis?: string
    notes: string
    advice?: string
    nextVisit?: string
  }) => Promise<PrescriptionEntry>

  editPrescription: (
    entryId: string,
    input: { diagnosis?: string; notes: string; advice?: string; nextVisit?: string },
  ) => Promise<PrescriptionEntry>

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

  async function addConsultation(
    patientId: string,
    input: {
      doctorId: string
      consultDate: string
      fee: number
      chiefComplaint: string
      oralExamination: string
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
      rx: input.rx,
      payment_status: input.paymentStatus,
      payment_mode: input.paymentMode,
      recommended_service_ids: input.recommendedServiceIds,
      recommendation_note: input.recommendationNote,
    })
  }

  async function updateConsultationDiscount(
    consultationId: string,
    discount: { type: 'percent' | 'amount'; value: number } | null,
  ) {
    return clinicalApi.updateConsultationDiscount(consultationId, {
      discount_type: discount?.type ?? null,
      discount_value: discount?.value ?? null,
    })
  }

  async function startTreatment(
    consultationId: string,
    input: { serviceId: string; doctorId: string; startedAt: string },
  ) {
    return clinicalApi.startTreatment(consultationId, {
      consultation_id: consultationId,
      service_id: input.serviceId,
      doctor_id: input.doctorId,
      started_at: input.startedAt,
    })
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
    discount: { type: 'percent' | 'amount'; value: number } | null,
  ) {
    return clinicalApi.updateTreatmentDiscount(treatmentId, {
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
    nextVisit?: string
  }) {
    return clinicalApi.createPrescription({
      patient_id: input.patientId,
      consultation_id: input.consultationId,
      visit_id: input.visitId,
      diagnosis: input.diagnosis,
      notes: input.notes,
      advice: input.advice,
      next_visit: input.nextVisit,
    })
  }

  async function editPrescription(
    entryId: string,
    input: { diagnosis?: string; notes: string; advice?: string; nextVisit?: string },
  ) {
    return clinicalApi.editPrescription(entryId, {
      diagnosis: input.diagnosis,
      notes: input.notes,
      advice: input.advice,
      next_visit: input.nextVisit,
    })
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
        addConsultation,
        updateConsultation,
        updateConsultationDiscount,
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
        addService,
        updateService,
        viewPrescriptionsPdf: clinicalApi.viewPrescriptionsPdf,
        viewHistoryPdf: clinicalApi.viewHistoryPdf,
        savePrescriptionsPdf: clinicalApi.savePrescriptionsPdf,
        saveHistoryPdf: clinicalApi.saveHistoryPdf,
        viewPrescriptionPdf: clinicalApi.viewPrescriptionPdf,
        savePrescriptionPdf: clinicalApi.savePrescriptionPdf,
        viewInvoicePdf: clinicalApi.viewInvoicePdf,
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
