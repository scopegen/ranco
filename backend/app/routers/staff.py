import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff, require_admin
from app.auth.security import hash_password
from app.database import get_db
from app.models import Staff
from app.schemas import SignatureUpload, StaffCreate, StaffOut, StaffUpdate
from app.signature import process_data_url

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
        registration_no=payload.registration_no,
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


@router.patch("/{staff_id}", response_model=StaffOut)
def update_staff(
    staff_id: uuid.UUID, payload: StaffUpdate, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)
):
    staff = db.get(Staff, staff_id)
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")

    if payload.email != staff.email:
        existing = db.scalar(select(Staff).where(Staff.email == payload.email, Staff.id != staff_id))
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A staff account with this email already exists")

    staff.name = payload.name
    staff.specialty = payload.specialty
    staff.registration_no = payload.registration_no
    staff.email = payload.email
    # Blank/omitted password leaves the current one untouched — this is an
    # edit form, not a "reset password" flow, so most saves won't include one.
    if payload.password:
        staff.hashed_password = hash_password(payload.password)

    db.commit()
    db.refresh(staff)
    return staff


@router.patch("/{staff_id}/signature", response_model=StaffOut)
def set_signature(
    staff_id: uuid.UUID, payload: SignatureUpload, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)
):
    """Admin-only, same as every other doctor-editing endpoint — there's no
    separate doctor-self-service login this project has built. Accepts
    either an uploaded image or a drawn-signature export; both get the same
    background-transparency treatment (see app/signature.py) before
    storing."""
    staff = db.get(Staff, staff_id)
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")

    try:
        staff.signature_image = process_data_url(payload.image_data)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Couldn't read that image")

    db.commit()
    db.refresh(staff)
    return staff


@router.delete("/{staff_id}/signature", response_model=StaffOut, status_code=status.HTTP_200_OK)
def clear_signature(staff_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    staff = db.get(Staff, staff_id)
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    staff.signature_image = None
    db.commit()
    db.refresh(staff)
    return staff
