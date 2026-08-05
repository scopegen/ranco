import uuid
from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Identity, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


# Checkbox options for Patient.medical_conditions — curated for dental
# relevance specifically (not a generic medical checklist). Each one changes
# how a doctor treats the patient: infection/healing risk (diabetes),
# anesthesia/antibiotic choice (heart disease, hypertension), extraction
# safety (bleeding disorders, osteoporosis/bisphosphonates), drug safety
# (pregnancy, allergies), or emergency risk in the chair (asthma, epilepsy).
MEDICAL_CONDITIONS = [
    "Diabetes",
    "Hypertension (High Blood Pressure)",
    "Heart Disease",
    "Bleeding Disorder / Blood Thinners",
    "Asthma",
    "Epilepsy / Seizure Disorder",
    "Thyroid Disorder",
    "Pregnancy",
    "Allergy to Medication (e.g. Penicillin)",
    "Smoking / Tobacco Use",
]


class StaffRole(str, PyEnum):
    admin = "admin"
    doctor = "doctor"


class PaymentStatus(str, PyEnum):
    paid = "paid"
    unpaid = "unpaid"


class PaymentMode(str, PyEnum):
    cash = "cash"
    card = "card"
    upi = "upi"


class TreatmentStatus(str, PyEnum):
    ongoing = "ongoing"
    finished = "finished"


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[StaffRole] = mapped_column(Enum(StaffRole, name="staff_role"), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Human-readable sequential ID (shown as "RANCO-0001" on the frontend) —
    # separate from the internal `id`, which nothing outside the system should
    # ever need to read or type.
    patient_number: Mapped[int] = mapped_column(Identity(), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    dob: Mapped[date] = mapped_column(Date, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    weight: Mapped[float | None] = mapped_column(Numeric(5, 2))
    # Checkbox flags (e.g. "Diabetes", "Pregnancy") — free-text detail still
    # goes in medical_history below; this is just for at-a-glance safety flags.
    medical_conditions: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    medical_history: Mapped[str | None] = mapped_column(Text)
    added_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    listed_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Consultation(Base):
    __tablename__ = "consultations"

    id: Mapped[uuid.UUID] = uuid_pk()
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    consult_date: Mapped[date] = mapped_column(Date, nullable=False)
    fee: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    findings: Mapped[str] = mapped_column(Text, nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus, name="payment_status"), nullable=False)
    payment_mode: Mapped[PaymentMode | None] = mapped_column(Enum(PaymentMode, name="payment_mode"))
    recommended_service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("services.id"))


class Treatment(Base):
    __tablename__ = "treatments"

    id: Mapped[uuid.UUID] = uuid_pk()
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("services.id"), nullable=False)
    doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    consultation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consultations.id"), nullable=False)
    status: Mapped[TreatmentStatus] = mapped_column(
        Enum(TreatmentStatus, name="treatment_status"), default=TreatmentStatus.ongoing, nullable=False
    )
    started_at: Mapped[date] = mapped_column(Date, nullable=False)
    completed_at: Mapped[date | None] = mapped_column(Date)


class TreatmentHandoff(Base):
    __tablename__ = "treatment_handoffs"

    id: Mapped[uuid.UUID] = uuid_pk()
    treatment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("treatments.id"), nullable=False)
    from_doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    to_doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    changed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reason: Mapped[str | None] = mapped_column(Text)


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[uuid.UUID] = uuid_pk()
    treatment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("treatments.id"), nullable=False)
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)
    listed_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    discounted_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.unpaid, nullable=False
    )
    payment_mode: Mapped[PaymentMode | None] = mapped_column(Enum(PaymentMode, name="payment_mode"))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PrescriptionEntry(Base):
    __tablename__ = "prescription_entries"

    id: Mapped[uuid.UUID] = uuid_pk()
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    consultation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("consultations.id"))
    visit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("visits.id"))
    diagnosis: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str] = mapped_column(Text, nullable=False)  # the Rx itself — one line per medicine
    advice: Mapped[str | None] = mapped_column(Text)
    next_visit: Mapped[str | None] = mapped_column(String(120))
    added_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    versions: Mapped[list["PrescriptionVersion"]] = relationship(
        back_populates="entry", order_by="PrescriptionVersion.version_number"
    )


class PrescriptionVersion(Base):
    __tablename__ = "prescription_versions"

    id: Mapped[uuid.UUID] = uuid_pk()
    prescription_entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prescription_entries.id"), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    edited_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    edited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    version_number: Mapped[int] = mapped_column(nullable=False)

    entry: Mapped[PrescriptionEntry] = relationship(back_populates="versions")


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = uuid_pk()
    treatment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("treatments.id"), nullable=False)
    listed_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    discount_total: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    final_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_mode: Mapped[PaymentMode] = mapped_column(Enum(PaymentMode, name="payment_mode"), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    issued_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)