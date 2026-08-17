import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff, require_admin
from app.database import get_db
from app.models import Consultation, Service, Staff, Treatment, TreatmentHandoff, TreatmentPayment
from app.schemas import (
    TreatmentBillingOut,
    TreatmentCreate,
    TreatmentDiscountUpdate,
    TreatmentHandoffCreate,
    TreatmentHandoffOut,
    TreatmentOut,
    TreatmentPaymentCreate,
    TreatmentPaymentOut,
)

router = APIRouter(tags=["treatments"])


@router.post("/consultations/{consultation_id}/treatments", response_model=TreatmentOut, status_code=status.HTTP_201_CREATED)
def start_treatment(
    consultation_id: uuid.UUID,
    payload: TreatmentCreate,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    consultation = db.get(Consultation, consultation_id)
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found")

    service = db.get(Service, payload.service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    existing = db.scalar(select(Treatment).where(Treatment.consultation_id == consultation_id))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This consultation already has a treatment")

    treatment = Treatment(
        patient_id=consultation.patient_id,
        consultation_id=consultation_id,
        service_id=payload.service_id,
        doctor_id=payload.doctor_id,
        started_at=payload.started_at,
        # Snapshot today's catalog price — see the comment on the model
        # field for why this must not be a live lookup.
        service_price=service.listed_price,
    )
    db.add(treatment)
    db.commit()
    db.refresh(treatment)
    return treatment


@router.get("/patients/{patient_id}/treatments", response_model=list[TreatmentOut])
def list_treatments(patient_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)):
    return db.scalars(
        select(Treatment).where(Treatment.patient_id == patient_id).order_by(Treatment.started_at.desc())
    ).all()


@router.post("/treatments/{treatment_id}/handoff", response_model=TreatmentHandoffOut, status_code=status.HTTP_201_CREATED)
def handoff_treatment(
    treatment_id: uuid.UUID,
    payload: TreatmentHandoffCreate,
    db: Session = Depends(get_db),
    current: Staff = Depends(get_current_staff),
):
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")

    handoff = TreatmentHandoff(
        treatment_id=treatment_id,
        from_doctor_id=treatment.doctor_id,
        to_doctor_id=payload.to_doctor_id,
        changed_by=current.id,
        reason=payload.reason,
    )
    treatment.doctor_id = payload.to_doctor_id
    db.add(handoff)
    db.commit()
    db.refresh(handoff)
    return handoff


def _billing_summary(db: Session, treatment: Treatment) -> TreatmentBillingOut:
    # The price the patient was actually quoted, locked in when the
    # treatment started — never re-derived from the (possibly since
    # changed) service catalog. See Treatment.service_price.
    service_price = float(treatment.service_price)

    discount_amount = 0.0
    if treatment.discount_type and treatment.discount_value:
        if treatment.discount_type == "percent":
            discount_amount = service_price * (float(treatment.discount_value) / 100)
        else:
            discount_amount = float(treatment.discount_value)
        discount_amount = min(discount_amount, service_price)

    payments = list(
        db.scalars(
            select(TreatmentPayment)
            .where(TreatmentPayment.treatment_id == treatment.id)
            .order_by(TreatmentPayment.paid_at.desc())
        )
    )
    amount_paid = sum(float(p.amount) for p in payments)
    amount_pending = max(0.0, service_price - discount_amount - amount_paid)

    return TreatmentBillingOut(
        service_price=service_price,
        discount_type=treatment.discount_type,
        discount_value=float(treatment.discount_value) if treatment.discount_value is not None else None,
        discount_amount=discount_amount,
        amount_paid=amount_paid,
        amount_pending=amount_pending,
        payments=payments,
    )


@router.get("/treatments/{treatment_id}/billing", response_model=TreatmentBillingOut)
def get_treatment_billing(
    treatment_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)
):
    """Admin-only — doctors have no path to any billing data for a treatment."""
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    return _billing_summary(db, treatment)


@router.patch("/treatments/{treatment_id}/discount", response_model=TreatmentBillingOut)
def update_treatment_discount(
    treatment_id: uuid.UUID,
    payload: TreatmentDiscountUpdate,
    db: Session = Depends(get_db),
    _admin: Staff = Depends(require_admin),
):
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    treatment.discount_type = payload.discount_type
    treatment.discount_value = payload.discount_value
    db.commit()
    db.refresh(treatment)
    return _billing_summary(db, treatment)


@router.post(
    "/treatments/{treatment_id}/payments", response_model=TreatmentBillingOut, status_code=status.HTTP_201_CREATED
)
def record_treatment_payment(
    treatment_id: uuid.UUID,
    payload: TreatmentPaymentCreate,
    db: Session = Depends(get_db),
    admin: Staff = Depends(require_admin),
):
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")

    payment = TreatmentPayment(
        treatment_id=treatment_id,
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        recorded_by=admin.id,
    )
    db.add(payment)
    db.commit()
    return _billing_summary(db, treatment)