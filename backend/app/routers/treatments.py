import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff
from app.database import get_db
from app.models import Consultation, Staff, Treatment, TreatmentHandoff
from app.schemas import TreatmentCreate, TreatmentHandoffCreate, TreatmentHandoffOut, TreatmentOut

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

    existing = db.scalar(select(Treatment).where(Treatment.consultation_id == consultation_id))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This consultation already has a treatment")

    treatment = Treatment(
        patient_id=consultation.patient_id,
        consultation_id=consultation_id,
        service_id=payload.service_id,
        doctor_id=payload.doctor_id,
        started_at=payload.started_at,
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