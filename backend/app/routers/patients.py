import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff
from app.database import get_db
from app.models import MEDICAL_CONDITIONS, Consultation, Patient, Staff, StaffRole, Treatment
from app.schemas import PatientCreate, PatientOut

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("/medical-conditions", response_model=list[str])
def list_medical_conditions(_current: Staff = Depends(get_current_staff)):
    return MEDICAL_CONDITIONS


@router.get("/sectors", response_model=list[str])
def list_sectors(db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)):
    """No fixed list makes sense for sector (unlike city) — this grows from
    whatever's actually been entered so far, same "pick one or type your
    own" combo box on the frontend."""
    sectors = db.scalars(
        select(Patient.sector).where(Patient.sector != "").distinct().order_by(Patient.sector)
    ).all()
    return list(sectors)


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(payload: PatientCreate, db: Session = Depends(get_db), current: Staff = Depends(get_current_staff)):
    patient = Patient(**payload.model_dump(), added_by=current.id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("", response_model=list[PatientOut])
def list_patients(db: Session = Depends(get_db), current: Staff = Depends(get_current_staff)):
    if current.role == StaffRole.admin:
        return db.scalars(select(Patient).order_by(Patient.registered_at.desc())).all()

    # Doctor: only patients they have a consultation or treatment on.
    patient_ids = set(db.scalars(select(Consultation.patient_id).where(Consultation.doctor_id == current.id)))
    patient_ids |= set(db.scalars(select(Treatment.patient_id).where(Treatment.doctor_id == current.id)))
    if not patient_ids:
        return []
    return db.scalars(
        select(Patient).where(Patient.id.in_(patient_ids)).order_by(Patient.registered_at.desc())
    ).all()


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: uuid.UUID, db: Session = Depends(get_db), current: Staff = Depends(get_current_staff)):
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: uuid.UUID,
    payload: PatientCreate,
    db: Session = Depends(get_db),
    current: Staff = Depends(get_current_staff),
):
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    for field, value in payload.model_dump().items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient