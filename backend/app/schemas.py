import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, model_validator

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
    # Exactly one of these is expected from the frontend, depending on which
    # entry mode the user picked (full DOB / age / birth year only) — age
    # itself is never sent here, the frontend converts it to birth_year
    # before submitting.
    dob: date | None = None
    birth_year: int | None = None
    email: str | None = None
    weight: float | None = None
    medical_conditions: list[str] = []
    medical_history: str | None = None

    @model_validator(mode="after")
    def _require_dob_or_birth_year(self) -> "PatientCreate":
        if self.dob is None and self.birth_year is None:
            raise ValueError("Provide either a full date of birth or a birth year.")
        return self


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient_number: int
    name: str
    phone: str
    address: str
    dob: date | None
    birth_year: int | None
    email: str | None
    weight: float | None
    medical_conditions: list[str]
    medical_history: str | None
    added_by: uuid.UUID
    registered_at: datetime


# ---- Service ----


class ServiceCreate(BaseModel):
    name: str
    category: str | None = None
    listed_price: float
    active: bool = True


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    category: str | None
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
    updated_at: datetime


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
    discount_type: Literal["percent", "amount"] | None = None
    discount_value: float | None = None

    @model_validator(mode="after")
    def _validate_discount(self) -> "GenerateInvoiceRequest":
        if self.discount_type is not None and self.discount_value is None:
            raise ValueError("discount_value is required when discount_type is set.")
        if self.discount_value is not None:
            if self.discount_value < 0:
                raise ValueError("Discount can't be negative.")
            if self.discount_type == "percent" and self.discount_value > 100:
                raise ValueError("A percentage discount can't exceed 100.")
        return self


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    treatment_id: uuid.UUID
    listed_total: float
    discount_type: Literal["percent", "amount"] | None
    discount_value: float | None
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