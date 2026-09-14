import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff
from app.database import get_db
from app.models import NextCall, NextCallStatus, Patient, Staff
from app.schemas import NextCallCreate, NextCallOut

router = APIRouter(tags=["next-calls"])


@router.post("/patients/{patient_id}/next-calls", response_model=NextCallOut, status_code=status.HTTP_201_CREATED)
def add_next_call(
    patient_id: uuid.UUID,
    payload: NextCallCreate,
    db: Session = Depends(get_db),
    current: Staff = Depends(get_current_staff),
):
    """Any staff can schedule a next call — same access as logging a visit
    or adding a consultation, not admin-only."""
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    next_call = NextCall(patient_id=patient_id, scheduled_at=payload.scheduled_at, added_by=current.id)
    db.add(next_call)
    db.commit()
    db.refresh(next_call)
    return next_call


@router.get("/patients/{patient_id}/next-calls", response_model=list[NextCallOut])
def list_next_calls(patient_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)):
    """Every entry ever added for this patient, soonest/most-recently-
    scheduled first — a history, not just the current one (see NextCall's
    docstring)."""
    return db.scalars(
        select(NextCall).where(NextCall.patient_id == patient_id).order_by(NextCall.scheduled_at.desc())
    ).all()


@router.patch("/next-calls/{next_call_id}/complete", response_model=NextCallOut)
def complete_next_call(
    next_call_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)
):
    next_call = db.get(NextCall, next_call_id)
    if next_call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Next call not found")

    next_call.status = NextCallStatus.done
    next_call.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(next_call)
    return next_call
