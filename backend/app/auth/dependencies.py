from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.database import get_db
from app.models import Staff, StaffRole

bearer_scheme = HTTPBearer()


def get_current_staff(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Staff:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    staff_id = decode_access_token(credentials.credentials)
    if staff_id is None:
        raise unauthorized

    staff = db.get(Staff, staff_id)
    if staff is None:
        raise unauthorized

    return staff


def require_admin(staff: Staff = Depends(get_current_staff)) -> Staff:
    if staff.role != StaffRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return staff