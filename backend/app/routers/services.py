import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff, require_admin
from app.database import get_db
from app.models import Service, Staff
from app.schemas import ServiceCreate, ServiceOut

router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)):
    return db.scalars(select(Service).order_by(Service.name)).all()


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(payload: ServiceCreate, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    service = Service(**payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: uuid.UUID,
    payload: ServiceCreate,
    db: Session = Depends(get_db),
    _admin: Staff = Depends(require_admin),
):
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    for field, value in payload.model_dump().items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service