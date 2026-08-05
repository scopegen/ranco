from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff
from app.auth.security import create_access_token, verify_password
from app.database import get_db
from app.models import Staff
from app.schemas import LoginRequest, StaffOut, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    staff = db.scalar(select(Staff).where(Staff.email == payload.email))
    if staff is None or not verify_password(payload.password, staff.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    token = create_access_token(staff.id)
    return TokenResponse(access_token=token, staff=StaffOut.model_validate(staff))


@router.get("/me", response_model=StaffOut)
def me(current: Staff = Depends(get_current_staff)):
    return current
