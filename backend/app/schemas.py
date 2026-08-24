import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, model_validator

from app.models import Gender, PaymentMode, PaymentStatus, ServiceType, StaffRole, TreatmentStatus

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
    gender: Gender | None = None
    height: float | None = None
    weight: float | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
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
    gender: Gender | None
    height: float | None
    weight: float | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    medical_conditions: list[str]
    medical_history: str | None
    added_by: uuid.UUID
    registered_at: datetime


# ---- Service ----


class ServiceCreate(BaseModel):
    name: str
    category: str | None = None
    service_type: ServiceType = ServiceType.dental
    listed_price: float
    active: bool = True


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    category: str | None
    service_type: ServiceType
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
    recommended_service_ids: list[uuid.UUID] = []
    recommendation_note: str | None = None


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
    paid_at: datetime | None
    recommended_service_ids: list[uuid.UUID]
    recommendation_note: str | None
    updated_at: datetime
    discount_type: Literal["percent", "amount"] | None
    discount_value: float | None


class ConsultationDiscountUpdate(BaseModel):
    discount_type: Literal["percent", "amount"] | None = None
    discount_value: float | None = None


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
    # Snapshot taken when the treatment started — see the model field's
    # comment. Exposed so the frontend can show "service charge" without a
    # second lookup, and so it can never drift from what was actually billed
    # even if the service's catalog price changes later.
    service_price: float
    discount_type: Literal["percent", "amount"] | None
    discount_value: float | None


class TreatmentDiscountUpdate(BaseModel):
    discount_type: Literal["percent", "amount"] | None = None
    discount_value: float | None = None

    @model_validator(mode="after")
    def _validate_discount(self) -> "TreatmentDiscountUpdate":
        if self.discount_type is not None and self.discount_value is None:
            raise ValueError("discount_value is required when discount_type is set.")
        if self.discount_value is not None:
            if self.discount_value < 0:
                raise ValueError("Discount can't be negative.")
            if self.discount_type == "percent" and self.discount_value > 100:
                raise ValueError("A percentage discount can't exceed 100.")
        return self


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
    # No longer collected from doctors — a treatment is billed once, as a
    # whole, not per visit. Left optional rather than removed, so nothing
    # breaks if it's ever sent.
    listed_price: float | None = None
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
    listed_price: float | None
    discounted_price: float | None
    payment_status: PaymentStatus
    payment_mode: PaymentMode | None
    paid_at: datetime | None


# ---- Invoice ----


class GenerateInvoiceRequest(BaseModel):
    """No discount here on purpose — an invoice is a record of the full,
    listed price of the services it covers. Whatever discount a service
    carries is a Billing-tab concern, not something the invoice document
    shows."""

    treatment_ids: list[uuid.UUID]
    payment_mode: PaymentMode = PaymentMode.cash

    @model_validator(mode="after")
    def _validate(self) -> "GenerateInvoiceRequest":
        if not self.treatment_ids:
            raise ValueError("Select at least one treatment.")
        if len(set(self.treatment_ids)) != len(self.treatment_ids):
            raise ValueError("The same treatment was selected more than once.")
        return self


class InvoiceLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    treatment_id: uuid.UUID
    amount: float


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    listed_total: float
    discount_type: Literal["percent", "amount"] | None
    discount_value: float | None
    discount_total: float
    final_total: float
    payment_mode: PaymentMode
    issued_at: datetime
    issued_by: uuid.UUID
    lines: list[InvoiceLineOut] = []


# ---- Billing (one combined bill per patient — see PatientPayment) ----


class PatientPaymentCreate(BaseModel):
    amount: float
    payment_mode: PaymentMode
    # Defaults to now if omitted — settable so staff can record a payment
    # against a date other than today.
    paid_at: datetime | None = None

    @model_validator(mode="after")
    def _validate_amount(self) -> "PatientPaymentCreate":
        if self.amount <= 0:
            raise ValueError("Payment amount must be greater than zero.")
        return self


class PatientPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient_id: uuid.UUID
    amount: float
    payment_mode: PaymentMode
    paid_at: datetime
    recorded_by: uuid.UUID


class PatientBillingSummary(BaseModel):
    """total_billed is every consultation fee plus every treatment's charge
    (service price minus that service's own discount), added the moment
    each is logged. total_paid folds in every PatientPayment plus, for
    continuity, whatever was already recorded under the old per-treatment/
    per-consultation payment tracking before this became one combined
    bill."""

    total_billed: float
    total_paid: float
    total_outstanding: float


class BillingHistoryEvent(BaseModel):
    date: datetime
    kind: Literal["consultation_billed", "consultation_paid", "treatment_billed", "payment", "invoice"]
    label: str
    amount: float
    mode: PaymentMode | None = None


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