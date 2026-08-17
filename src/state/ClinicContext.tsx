import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { clinicalApi } from '../lib/clinicalApi'
import { useAuth } from './AuthContext'
import type {
  Consultation,
  Invoice,
  PaymentMode,
  PaymentStatus,
  PrescriptionEntry,
  Service,
  ServiceType,
  Staff,
  Treatment,
  TreatmentBilling,
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

  addDoctor: (input: { name: string; specialty?: string; email: string; password: string }) => Promise<Staff>

  addConsultation: (
    patientId: string,
    input: {
      doctorId: string
      consultDate: string
      fee: number
      findings: string
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
      findings: string
      paymentStatus: PaymentStatus
      paymentMode?: PaymentMode
      recommendedServiceIds: string[]
      recommendationNote?: string
    },
  ) => Promise<Consultation>
  recordConsultationPayment: (
    patientId: string,
    consultationId: string,
    paymentMode: PaymentMode,
  ) => Promise<Consultation>

  startTreatment: (
    consultationId: string,
    input: { serviceId: string; doctorId: string; startedAt: string },
  ) => Promise<Treatment>

  logVisit: (treatmentId: string, input: { visitDate: string }) => Promise<Visit>

  getTreatmentBilling: (treatmentId: string) => Promise<TreatmentBilling>
  updateTreatmentDiscount: (
    treatmentId: string,
    discount: { type: 'percent' | 'amount'; value: number } | null,
  ) => Promise<TreatmentBilling>
  addTreatmentPayment: (
    treatmentId: string,
    input: { amount: number; paymentMode: PaymentMode },
  ) => Promise<TreatmentBilling>

  generateInvoice: (
    treatmentId: string,
    paymentMode: PaymentMode | null,
    discount?: { type: 'percent' | 'amount'; value: number } | null,
  ) => Promise<Invoice>
  viewInvoicePdf: (treatmentId: string) => Promise<void>

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

  async function addDoctor(input: { name: string; specialty?: string; email: string; password: string }) {
    const created = await clinicalApi.createStaff({ ...input, role: 'doctor' })
    setDoctors((prev) => [...prev, created])
    return created
  }

  async function addConsultation(
    patientId: string,
    input: {
      doctorId: string
      consultDate: string
      fee: number
      findings: string
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
      findings: input.findings,
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
      findings: string
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
      findings: input.findings,
      payment_status: input.paymentStatus,
      payment_mode: input.paymentMode,
      recommended_service_ids: input.recommendedServiceIds,
      recommendation_note: input.recommendationNote,
    })
  }

  async function recordConsultationPayment(patientId: string, consultationId: string, paymentMode: PaymentMode) {
    return clinicalApi.recordConsultationPayment(patientId, consultationId, { payment_mode: paymentMode })
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

  async function getTreatmentBilling(treatmentId: string) {
    return clinicalApi.getTreatmentBilling(treatmentId)
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

  async function addTreatmentPayment(treatmentId: string, input: { amount: number; paymentMode: PaymentMode }) {
    return clinicalApi.createTreatmentPayment(treatmentId, { amount: input.amount, payment_mode: input.paymentMode })
  }

  async function generateInvoice(
    treatmentId: string,
    paymentMode: PaymentMode | null,
    discount?: { type: 'percent' | 'amount'; value: number } | null,
  ) {
    return clinicalApi.generateInvoice(treatmentId, paymentMode, discount)
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
        recordConsultationPayment,
        startTreatment,
        logVisit,
        getTreatmentBilling,
        updateTreatmentDiscount,
        addTreatmentPayment,
        generateInvoice,
        addPrescription,
        editPrescription,
        addService,
        updateService,
        viewPrescriptionsPdf: clinicalApi.viewPrescriptionsPdf,
        viewHistoryPdf: clinicalApi.viewHistoryPdf,
        savePrescriptionsPdf: clinicalApi.savePrescriptionsPdf,
        saveHistoryPdf: clinicalApi.saveHistoryPdf,
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