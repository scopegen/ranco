import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff, require_admin
from app.database import get_db
from app.models import Consultation, Patient, Staff
from app.schemas import ConsultationCreate, ConsultationDiscountUpdate, ConsultationOut

router = APIRouter(tags=["consultations"])


def _consultation_charge(consultation: Consultation) -> tuple[float, float, float]:
    """(fee, discount_amount, charge) — mirrors treatments._treatment_charge
    exactly, same two discount types, same per-service billing concern."""
    fee = float(consultation.fee)
    discount_amount = 0.0
    if consultation.discount_type and consultation.discount_value:
        if consultation.discount_type == "percent":
            discount_amount = fee * (float(consultation.discount_value) / 100)
        else:
            discount_amount = float(consultation.discount_value)
        discount_amount = min(discount_amount, fee)
    return fee, discount_amount, fee - discount_amount


@router.post("/patients/{patient_id}/consultations", response_model=ConsultationOut, status_code=status.HTTP_201_CREATED)
def create_consultation(
    patient_id: uuid.UUID,
    payload: ConsultationCreate,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    # The fee is added to the patient's combined bill the moment this is
    # created — no separate "billed" step, same as a treatment's charge.
    consultation = Consultation(patient_id=patient_id, **payload.model_dump())
    db.add(consultation)
    db.commit()
    db.refresh(consultation)
    return consultation


@router.get("/patients/{patient_id}/consultations", response_model=list[ConsultationOut])
def list_consultations(
    patient_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)
):
    return db.scalars(
        select(Consultation).where(Consultation.patient_id == patient_id).order_by(Consultation.consult_date.desc())
    ).all()


@router.patch("/patients/{patient_id}/consultations/{consultation_id}", response_model=ConsultationOut)
def update_consultation(
    patient_id: uuid.UUID,
    consultation_id: uuid.UUID,
    payload: ConsultationCreate,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    consultation = db.get(Consultation, consultation_id)
    if consultation is None or consultation.patient_id != patient_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found")
    for field, value in payload.model_dump().items():
        setattr(consultation, field, value)
    db.commit()
    db.refresh(consultation)
    return consultation


@router.patch("/consultations/{consultation_id}/discount", response_model=ConsultationOut)
def update_consultation_discount(
    consultation_id: uuid.UUID,
    payload: ConsultationDiscountUpdate,
    db: Session = Depends(get_db),
    _admin: Staff = Depends(require_admin),
):
    """Admin-only — same discount mechanism as a treatment's, editable any
    time regardless of payment status."""
    consultation = db.get(Consultation, consultation_id)
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found")
    consultation.discount_type = payload.discount_type
    consultation.discount_value = payload.discount_value
    db.commit()
    db.refresh(consultation)
    return consultation
