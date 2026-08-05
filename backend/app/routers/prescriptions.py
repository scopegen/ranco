import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.dependencies import get_current_staff
from app.database import get_db
from app.models import PrescriptionEntry, PrescriptionVersion, Staff
from app.schemas import PrescriptionEntryCreate, PrescriptionEntryOut, PrescriptionEntryUpdate

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.post("", response_model=PrescriptionEntryOut, status_code=status.HTTP_201_CREATED)
def create_prescription(
    payload: PrescriptionEntryCreate, db: Session = Depends(get_db), current: Staff = Depends(get_current_staff)
):
    if payload.consultation_id is None and payload.visit_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A prescription must be attached to either a consultation or a visit",
        )

    entry = PrescriptionEntry(**payload.model_dump(), added_by=current.id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/patients/{patient_id}", response_model=list[PrescriptionEntryOut])
def list_prescriptions_for_patient(
    patient_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)
):
    return db.scalars(
        select(PrescriptionEntry)
        .where(PrescriptionEntry.patient_id == patient_id)
        .options(selectinload(PrescriptionEntry.versions))
        .order_by(PrescriptionEntry.created_at.desc())
    ).all()


@router.patch("/{entry_id}", response_model=PrescriptionEntryOut)
def edit_prescription(
    entry_id: uuid.UUID,
    payload: PrescriptionEntryUpdate,
    db: Session = Depends(get_db),
    current: Staff = Depends(get_current_staff),
):
    entry = db.get(PrescriptionEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription entry not found")
    if entry.added_by != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only the doctor who wrote this entry can edit it"
        )

    version_number = (
        db.query(PrescriptionVersion).filter(PrescriptionVersion.prescription_entry_id == entry_id).count() + 1
    )

    # Snapshot what it said *before* this edit.
    snapshot = PrescriptionVersion(
        prescription_entry_id=entry.id,
        notes=entry.notes,
        edited_by=current.id,
        version_number=version_number,
    )
    db.add(snapshot)

    entry.diagnosis = payload.diagnosis
    entry.notes = payload.notes
    entry.advice = payload.advice
    entry.next_visit = payload.next_visit
    entry.last_edited_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(entry)
    return entry