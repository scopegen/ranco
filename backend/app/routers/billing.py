import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.database import get_db
from app.models import (
    Consultation,
    Invoice,
    InvoiceLine,
    Patient,
    PatientPayment,
    PaymentStatus,
    Service,
    Staff,
    Treatment,
    TreatmentPayment,
)
from app.routers.consultations import _consultation_charge
from app.routers.treatments import _treatment_charge
from app.schemas import BillingHistoryEvent, PatientBillingSummary, PatientPaymentCreate, PatientPaymentOut

router = APIRouter(tags=["billing"])


def _patient_billing_totals(db: Session, patient_id: uuid.UUID) -> tuple[float, float]:
    """(total_billed, total_paid) across every consultation and treatment
    this patient has — see PatientBillingSummary for what these mean."""
    consultations = list(db.scalars(select(Consultation).where(Consultation.patient_id == patient_id)))
    treatments = list(db.scalars(select(Treatment).where(Treatment.patient_id == patient_id)))

    total_billed = 0.0
    total_paid = 0.0
    for c in consultations:
        _, _, charge = _consultation_charge(c)
        total_billed += charge
        if c.payment_status == PaymentStatus.paid:
            total_paid += charge

    for t in treatments:
        _, _, charge = _treatment_charge(t)
        total_billed += charge

    treatment_ids = [t.id for t in treatments]
    if treatment_ids:
        historical = db.scalars(select(TreatmentPayment).where(TreatmentPayment.treatment_id.in_(treatment_ids))).all()
        total_paid += sum(float(p.amount) for p in historical)

    patient_payments = db.scalars(select(PatientPayment).where(PatientPayment.patient_id == patient_id)).all()
    total_paid += sum(float(p.amount) for p in patient_payments)

    return total_billed, total_paid


@router.get("/patients/{patient_id}/billing-summary", response_model=PatientBillingSummary)
def get_billing_summary(patient_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    total_billed, total_paid = _patient_billing_totals(db, patient_id)
    return PatientBillingSummary(
        total_billed=total_billed,
        total_paid=total_paid,
        total_outstanding=max(0.0, total_billed - total_paid),
    )


@router.post("/patients/{patient_id}/payments", response_model=PatientPaymentOut, status_code=status.HTTP_201_CREATED)
def create_patient_payment(
    patient_id: uuid.UUID,
    payload: PatientPaymentCreate,
    db: Session = Depends(get_db),
    admin: Staff = Depends(require_admin),
):
    """Admin-only. Not linked to any specific consultation or treatment —
    one payment against the patient's single combined bill."""
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    payment = PatientPayment(
        patient_id=patient_id,
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        paid_at=payload.paid_at or datetime.now(timezone.utc),
        recorded_by=admin.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/patients/{patient_id}/payments", response_model=list[PatientPaymentOut])
def list_patient_payments(patient_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    return db.scalars(
        select(PatientPayment).where(PatientPayment.patient_id == patient_id).order_by(PatientPayment.paid_at.desc())
    ).all()


@router.get("/patients/{patient_id}/billing-history", response_model=list[BillingHistoryEvent])
def get_billing_history(patient_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    """Everything that's ever touched this patient's bill, newest first:
    consultations/treatments being billed, current PatientPayments,
    historical per-item payments from before the combined bill existed, and
    invoices generated."""
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    consultations = list(db.scalars(select(Consultation).where(Consultation.patient_id == patient_id)))
    treatments = list(db.scalars(select(Treatment).where(Treatment.patient_id == patient_id)))
    service_ids = {t.service_id for t in treatments}
    services = (
        {s.id: s for s in db.scalars(select(Service).where(Service.id.in_(service_ids)))} if service_ids else {}
    )

    events: list[BillingHistoryEvent] = []

    for c in consultations:
        _, _, c_charge = _consultation_charge(c)
        events.append(
            BillingHistoryEvent(
                date=datetime.combine(c.consult_date, datetime.min.time(), tzinfo=timezone.utc),
                kind="consultation_billed",
                label="Consultation",
                amount=c_charge,
            )
        )
        if c.payment_status == PaymentStatus.paid and c.paid_at:
            events.append(
                BillingHistoryEvent(
                    date=c.paid_at,
                    kind="consultation_paid",
                    label="Consultation paid",
                    amount=c_charge,
                    mode=c.payment_mode,
                )
            )

    for t in treatments:
        _, _, charge = _treatment_charge(t)
        label = services[t.service_id].name if t.service_id in services else "Service"
        events.append(
            BillingHistoryEvent(
                date=datetime.combine(t.started_at, datetime.min.time(), tzinfo=timezone.utc),
                kind="treatment_billed",
                label=label,
                amount=charge,
            )
        )

    treatment_ids = [t.id for t in treatments]
    if treatment_ids:
        historical = db.scalars(select(TreatmentPayment).where(TreatmentPayment.treatment_id.in_(treatment_ids)))
        for p in historical:
            events.append(
                BillingHistoryEvent(date=p.paid_at, kind="payment", label="Payment", amount=float(p.amount), mode=p.payment_mode)
            )

    for p in db.scalars(select(PatientPayment).where(PatientPayment.patient_id == patient_id)):
        events.append(
            BillingHistoryEvent(date=p.paid_at, kind="payment", label="Payment", amount=float(p.amount), mode=p.payment_mode)
        )

    if treatment_ids:
        lines = list(db.scalars(select(InvoiceLine).where(InvoiceLine.treatment_id.in_(treatment_ids))))
        invoice_ids = {line.invoice_id for line in lines}
        if invoice_ids:
            for inv in db.scalars(select(Invoice).where(Invoice.id.in_(invoice_ids))):
                events.append(
                    BillingHistoryEvent(
                        date=inv.issued_at, kind="invoice", label="Invoice generated", amount=float(inv.final_total)
                    )
                )

    events.sort(key=lambda e: e.date, reverse=True)
    return events
