from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff, require_admin
from app.auth.security import hash_password
from app.database import get_db
from app.models import Staff
from app.schemas import StaffCreate, StaffOut

router = APIRouter(prefix="/staff", tags=["staff"])


@router.get("", response_model=list[StaffOut])
def list_staff(db: Session = Depends(get_db), current: Staff = Depends(get_current_staff)):
    return db.scalars(select(Staff).order_by(Staff.name)).all()


@router.post("", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
def create_staff(payload: StaffCreate, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    existing = db.scalar(select(Staff).where(Staff.email == payload.email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A staff account with this email already exists")

    staff = Staff(
        name=payload.name,
        role=payload.role,
        specialty=payload.specialty,
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff
