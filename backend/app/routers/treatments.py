import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff, require_admin
from app.database import get_db
from app.models import Consultation, Service, Staff, Treatment, TreatmentHandoff, TreatmentStatus
from app.schemas import (
    TreatmentCreate,
    TreatmentDiscountUpdate,
    TreatmentHandoffCreate,
    TreatmentHandoffOut,
    TreatmentOut,
)

router = APIRouter(tags=["treatments"])


def _treatment_charge(treatment: Treatment) -> tuple[float, float, float]:
    """(service_price, discount_amount, charge) — charge is what this one
    treatment contributes to the patient's combined bill. service_price is
    the snapshot taken when the treatment started (see the model field),
    never re-derived from the service catalog."""
    service_price = float(treatment.service_price)
    discount_amount = 0.0
    if treatment.discount_type and treatment.discount_value:
        if treatment.discount_type == "percent":
            discount_amount = service_price * (float(treatment.discount_value) / 100)
        else:
            discount_amount = float(treatment.discount_value)
        discount_amount = min(discount_amount, service_price)
    return service_price, discount_amount, service_price - discount_amount


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

    # A consultation can recommend several services, each becoming its own
    # treatment — only block starting a second treatment for the exact same
    # service under the same consultation.
    existing = db.scalar(
        select(Treatment).where(
            Treatment.consultation_id == consultation_id,
            Treatment.service_id == payload.service_id,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This consultation already has a treatment for that service"
        )

    treatment = Treatment(
        patient_id=consultation.patient_id,
        consultation_id=consultation_id,
        service_id=payload.service_id,
        doctor_id=payload.doctor_id,
        started_at=payload.started_at,
        # Snapshot today's catalog price — see the comment on the model
        # field for why this must not be a live lookup. This amount is
        # added to the patient's combined bill immediately, the moment the
        # treatment is logged — billing doesn't wait for anything else.
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


@router.patch("/treatments/{treatment_id}/discount", response_model=TreatmentOut)
def update_treatment_discount(
    treatment_id: uuid.UUID,
    payload: TreatmentDiscountUpdate,
    db: Session = Depends(get_db),
    _admin: Staff = Depends(require_admin),
):
    """Admin-only — discounts stay a per-service concern even though payment
    itself is now tracked on the patient's combined bill, not per-service."""
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    treatment.discount_type = payload.discount_type
    treatment.discount_value = payload.discount_value
    db.commit()
    db.refresh(treatment)
    return treatment


@router.post("/treatments/{treatment_id}/end", response_model=TreatmentOut)
def end_treatment(
    treatment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    """Marks a treatment finished, completed today — one click, no form.
    Same access as logging a visit (any staff, not admin-only); billing is
    untouched by this, same as everything else in the new combined-bill
    model."""
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    if treatment.status == TreatmentStatus.finished:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Treatment is already finished")
    treatment.status = TreatmentStatus.finished
    treatment.completed_at = date.today()
    db.commit()
    db.refresh(treatment)
    return treatment
