import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff
from app.database import get_db
from app.models import PaymentStatus, Staff, Treatment, Visit
from app.schemas import VisitCreate, VisitOut, VisitUpdate

router = APIRouter(tags=["visits"])


@router.post("/treatments/{treatment_id}/visits", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
def log_visit(
    treatment_id: uuid.UUID,
    payload: VisitCreate,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")

    visit = Visit(
        treatment_id=treatment_id,
        **payload.model_dump(),
        paid_at=datetime.now(timezone.utc) if payload.payment_status == PaymentStatus.paid else None,
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return visit


@router.get("/treatments/{treatment_id}/visits", response_model=list[VisitOut])
def list_visits(treatment_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)):
    return db.scalars(
        select(Visit).where(Visit.treatment_id == treatment_id).order_by(Visit.visit_date.desc())
    ).all()


@router.patch("/visits/{visit_id}", response_model=VisitOut)
def update_visit_payment(
    visit_id: uuid.UUID,
    payload: VisitUpdate,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")

    visit.payment_status = payload.payment_status
    visit.payment_mode = payload.payment_mode
    visit.paid_at = datetime.now(timezone.utc) if payload.payment_status == PaymentStatus.paid else None
    db.commit()
    db.refresh(visit)
    return visit