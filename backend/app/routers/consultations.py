import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff
from app.database import get_db
from app.models import Consultation, Patient, Staff
from app.schemas import ConsultationCreate, ConsultationOut

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