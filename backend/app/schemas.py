import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import PaymentMode, PaymentStatus, StaffRole, TreatmentStatus

# ---- Staff / auth ----


class StaffCreate(BaseModel):
    name: str
    role: StaffRole
    specialty: str | None = None
    email: EmailStr
    password: str


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    role: StaffRole
    specialty: str | None
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    staff: StaffOut


# ---- Patient ----


class PatientCreate(BaseModel):
    name: str
    phone: str
    address: str
    dob: date
    email: str | None = None
    weight: float | None = None
    medical_conditions: list[str] = []
    medical_history: str | None = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient_number: int
    name: str
    phone: str
    address: str
    dob: date
    email: str | None
    weight: float | None
    medical_conditions: list[str]
    medical_history: str | None
    added_by: uuid.UUID
    registered_at: datetime


# ---- Service ----


class ServiceCreate(BaseModel):
    name: str
    listed_price: float
    active: bool = True


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    listed_price: float
    active: bool


# ---- Consultation ----


class ConsultationCreate(BaseModel):
    doctor_id: uuid.UUID
    consult_date: date
    fee: float
    findings: str
    payment_status: PaymentStatus
    payment_mode: PaymentMode | None = None
    recommended_service_id: uuid.UUID | None = None


class ConsultationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient_id: uuid.UUID
    doctor_id: uuid.UUID
    consult_date: date
    fee: float
    findings: str
    payment_status: PaymentStatus
    payment_mode: PaymentMode | None
    recommended_service_id: uuid.UUID | None


# ---- Treatment ----


class TreatmentCreate(BaseModel):
    consultation_id: uuid.UUID
    service_id: uuid.UUID
    doctor_id: uuid.UUID
    started_at: date


class TreatmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient_id: uuid.UUID
    service_id: uuid.UUID
    doctor_id: uuid.UUID
    consultation_id: uuid.UUID
    status: TreatmentStatus
    started_at: date
    completed_at: date | None


class TreatmentHandoffCreate(BaseModel):
    to_doctor_id: uuid.UUID
    reason: str | None = None


class TreatmentHandoffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    treatment_id: uuid.UUID
    from_doctor_id: uuid.UUID
    to_doctor_id: uuid.UUID
    changed_by: uuid.UUID
    changed_at: datetime
    reason: str | None


# ---- Visit ----


class VisitCreate(BaseModel):
    visit_date: date
    listed_price: float
    discounted_price: float | None = None
    payment_status: PaymentStatus = PaymentStatus.unpaid
    payment_mode: PaymentMode | None = None


class VisitUpdate(BaseModel):
    payment_status: PaymentStatus
    payment_mode: PaymentMode | None = None


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    treatment_id: uuid.UUID
    visit_date: date
    listed_price: float
    discounted_price: float | None
    payment_status: PaymentStatus
    payment_mode: PaymentMode | None
    paid_at: datetime | None


# ---- Invoice ----


class GenerateInvoiceRequest(BaseModel):
    payment_mode: PaymentMode | None = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    treatment_id: uuid.UUID
    listed_total: float
    discount_total: float
    final_total: float
    payment_mode: PaymentMode
    issued_at: datetime
    issued_by: uuid.UUID


# ---- Prescriptions ----


class PrescriptionEntryCreate(BaseModel):
    patient_id: uuid.UUID
    consultation_id: uuid.UUID | None = None
    visit_id: uuid.UUID | None = None
    diagnosis: str | None = None
    notes: str
    advice: str | None = None
    next_visit: str | None = None


class PrescriptionEntryUpdate(BaseModel):
    diagnosis: str | None = None
    notes: str
    advice: str | None = None
    next_visit: str | None = None


class PrescriptionVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    notes: str
    edited_by: uuid.UUID
    edited_at: datetime
    version_number: int


class PrescriptionEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient_id: uuid.UUID
    consultation_id: uuid.UUID | None
    visit_id: uuid.UUID | None
    diagnosis: str | None
    notes: str
    advice: str | None
    next_visit: str | None
    added_by: uuid.UUID
    created_at: datetime
    last_edited_at: datetime | None
    versions: list[PrescriptionVersionOut] = []