import uuid
from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey, Identity, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
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


class Gender(str, PyEnum):
    male = "male"
    female = "female"
    other = "other"


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


class ServiceType(str, PyEnum):
    dental = "dental"
    lab = "lab"


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[StaffRole] = mapped_column(Enum(StaffRole, name="staff_role"), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(120))
    # Shown on the prescription PDF letterhead alongside name/specialty —
    # e.g. "Reg. No. A-17490". Null just omits that line (no fallback text).
    registration_no: Mapped[str | None] = mapped_column(String(60))
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
    # Replaced the old single free-text `address` field — city has a fixed
    # dropdown of nearby areas on the frontend (with free typing for
    # anything else), sector doesn't (no fixed list makes sense for it), so
    # its dropdown there is populated from sectors already in use instead.
    city: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    sector: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    # Exactly one of these two is set, enforced in the Pydantic schema:
    # dob when the full date of birth is known, birth_year when only the
    # year (or an age, converted to a year on the frontend) is known.
    dob: Mapped[date | None] = mapped_column(Date)
    birth_year: Mapped[int | None] = mapped_column(Integer)
    email: Mapped[str | None] = mapped_column(String(255))
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender, name="gender"))
    height: Mapped[float | None] = mapped_column(Numeric(5, 2))
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
    # Optional grouping label (e.g. "Root Canal Treatment" for the "Molar
    # RCT" / "Re-RCT" / etc. variants) — purely for display grouping, no
    # relational meaning, so a plain nullable string is enough.
    category: Mapped[str | None] = mapped_column(String(80))
    # Whether the clinic performs this in-house (dental) or it's fulfilled by
    # an external lab (lab) — e.g. crowns/bridges sent out for fabrication.
    service_type: Mapped[ServiceType] = mapped_column(
        Enum(ServiceType, name="service_type"), default=ServiceType.dental, nullable=False
    )
    listed_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Consultation(Base):
    __tablename__ = "consultations"

    id: Mapped[uuid.UUID] = uuid_pk()
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)
    consult_date: Mapped[date] = mapped_column(Date, nullable=False)
    fee: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # Renamed from "findings" — same field, clearer clinical label. Existing
    # rows keep their data (migration renames the column, doesn't drop it).
    chief_complaint: Mapped[str] = mapped_column(Text, nullable=False, default="")
    oral_examination: Mapped[str] = mapped_column(Text, nullable=False)
    # [{"medicine": "...", "frequency": "OD"}, ...] — structured so the
    # frequency can be a fixed dropdown instead of free text.
    rx: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus, name="payment_status"), nullable=False)
    payment_mode: Mapped[PaymentMode | None] = mapped_column(Enum(PaymentMode, name="payment_mode"))
    # Set when admin records the (one-time, full) consultation payment —
    # doctors never touch this. Separate from updated_at below, which
    # tracks edits to the clinical record itself.
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # A consultation can recommend several catalog services at once (no
    # per-element FK — same tradeoff as Patient.medical_conditions above),
    # plus a free-text note for anything not in the catalog.
    recommended_service_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list, nullable=False)
    recommendation_note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # Same discount mechanism as Treatment.discount_type/discount_value below
    # — a per-service concern that only affects the patient's combined bill,
    # never shown on any generated document.
    discount_type: Mapped[str | None] = mapped_column(String(10))
    discount_value: Mapped[float | None] = mapped_column(Numeric(10, 2))


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
    # Billing (separate from the older per-treatment Invoice below, which is
    # a distinct generate-a-PDF flow left untouched for now).
    #
    # service_price is a SNAPSHOT of Service.listed_price taken the moment
    # the treatment is started — deliberately NOT looked up live from the
    # service catalog. If the clinic later raises/lowers that service's
    # price, treatments already in progress (or finished) must keep billing
    # at the price the patient was originally quoted; only new treatments
    # started after the change pick up the new catalog price.
    service_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    discount_type: Mapped[str | None] = mapped_column(String(10))
    discount_value: Mapped[float | None] = mapped_column(Numeric(10, 2))


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
    # Visits no longer carry pricing — a treatment is billed once, as a
    # whole (see TreatmentPayment below), not per visit. These stay
    # nullable/unused for new visits rather than dropped, so historical
    # visits logged before this change keep their recorded amounts.
    listed_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    discounted_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.unpaid, nullable=False
    )
    payment_mode: Mapped[PaymentMode | None] = mapped_column(Enum(PaymentMode, name="payment_mode"))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TreatmentPayment(Base):
    """Historical only — a single payment toward one specific treatment's
    charge, from the era when billing was tracked per-service. Superseded by
    PatientPayment (one combined bill per patient, not linked to any
    specific treatment or consultation). Kept, and still summed into a
    patient's total-paid figure, purely so payments recorded before that
    change don't vanish from the numbers; nothing writes new rows here."""

    __tablename__ = "treatment_payments"

    id: Mapped[uuid.UUID] = uuid_pk()
    treatment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("treatments.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_mode: Mapped[PaymentMode] = mapped_column(Enum(PaymentMode, name="payment_mode"), nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    recorded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)


class PatientPayment(Base):
    """One payment against a patient's single combined bill (consultation
    fees + every treatment's charge, added up) — not linked to any specific
    consultation or treatment. paid_at is admin-settable (not just
    server-default) since the Add Payment form lets staff record a payment
    against a date other than today, e.g. entering a payment collected
    yesterday."""

    __tablename__ = "patient_payments"

    id: Mapped[uuid.UUID] = uuid_pk()
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_mode: Mapped[PaymentMode] = mapped_column(Enum(PaymentMode, name="payment_mode"), nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    recorded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)


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
    """One invoice can cover several treatments at once (picked together in
    the Billing tab) — see InvoiceLine below for which treatments and how
    much of the total each contributed."""

    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Human-readable sequential number shown on the invoice PDF as
    # "INV-0001" — separate from `id` (the internal UUID primary key, never
    # shown to anyone), same pattern as Patient.patient_number.
    invoice_number: Mapped[int] = mapped_column(Integer, Identity(always=False), unique=True, nullable=False)
    listed_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # discount_type/discount_value are what the staff member actually entered
    # ("10" + percent, or "500" + amount) — kept alongside discount_total (the
    # resulting ₹ figure) so the invoice can display *how* the discount was
    # given, not just the final number.
    discount_type: Mapped[str | None] = mapped_column(String(10))
    discount_value: Mapped[float | None] = mapped_column(Numeric(10, 2))
    discount_total: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    final_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_mode: Mapped[PaymentMode] = mapped_column(Enum(PaymentMode, name="payment_mode"), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    issued_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id"), nullable=False)

    lines: Mapped[list["InvoiceLine"]] = relationship(back_populates="invoice")


class InvoiceLine(Base):
    """One treatment's or one consultation's contribution to an invoice —
    exactly one of treatment_id/consultation_id is set per line (enforced by
    the check constraint below). amount is that item's full listed price at
    the moment the invoice was generated, before the invoice's own discount
    is applied (the discount is spread proportionally across lines when
    settling each item; see routers/invoices.py). A treatment or
    consultation can appear on at most one invoice."""

    __tablename__ = "invoice_lines"
    __table_args__ = (
        CheckConstraint(
            "(treatment_id IS NOT NULL) != (consultation_id IS NOT NULL)",
            name="invoice_line_exactly_one_source",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), nullable=False)
    treatment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("treatments.id"), unique=True)
    consultation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("consultations.id"), unique=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    invoice: Mapped[Invoice] = relationship(back_populates="lines")