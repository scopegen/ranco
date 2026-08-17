import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff, require_admin
from app.database import get_db
from app.models import Consultation, Patient, PaymentStatus, Staff
from app.schemas import ConsultationCreate, ConsultationOut, RecordConsultationPaymentRequest

router = APIRouter(tags=["consultations"])


@router.post("/patients/{patient_id}/consultations", response_model=ConsultationOut, status_code=status.HTTP_201_CREATED)
def create_consultation(
    patient_id: uuid.UUID,
    payload: ConsultationCreate,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

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


@router.patch("/patients/{patient_id}/consultations/{consultation_id}/payment", response_model=ConsultationOut)
def record_consultation_payment(
    patient_id: uuid.UUID,
    consultation_id: uuid.UUID,
    payload: RecordConsultationPaymentRequest,
    db: Session = Depends(get_db),
    _admin: Staff = Depends(require_admin),
):
    """Admin-only — a consultation's fee is paid once, in full. Doctors have
    no path to this endpoint at all (require_admin, and no UI calls it from
    anywhere a doctor can reach)."""
    consultation = db.get(Consultation, consultation_id)
    if consultation is None or consultation.patient_id != patient_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found")
    consultation.payment_status = PaymentStatus.paid
    consultation.payment_mode = payload.payment_mode
    consultation.paid_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(consultation)
    return consultation