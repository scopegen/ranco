import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff
from app.database import get_db
from app.models import Invoice, PaymentMode, PaymentStatus, Staff, Treatment, TreatmentStatus, Visit
from app.schemas import GenerateInvoiceRequest, InvoiceOut

router = APIRouter(tags=["invoices"])


@router.post("/treatments/{treatment_id}/generate-invoice", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def generate_invoice(
    treatment_id: uuid.UUID,
    payload: GenerateInvoiceRequest,
    db: Session = Depends(get_db),
    current: Staff = Depends(get_current_staff),
):
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    if treatment.status == TreatmentStatus.finished:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Treatment is already finished")

    # Only visits still unpaid at this moment get swept into the invoice —
    # anything already settled per-visit is NOT re-added here, to avoid
    # double-counting (this is the exact bug caught and fixed on the frontend).
    unpaid_visits = db.scalars(
        select(Visit).where(Visit.treatment_id == treatment_id, Visit.payment_status == PaymentStatus.unpaid)
    ).all()

    total = sum(float(v.discounted_price if v.discounted_price is not None else v.listed_price) for v in unpaid_visits)
    mode = payload.payment_mode or PaymentMode.cash
    now = datetime.now(timezone.utc)

    invoice = Invoice(
        treatment_id=treatment_id,
        listed_total=total,
        discount_total=0,
        final_total=total,
        payment_mode=mode,
        issued_by=current.id,
    )
    db.add(invoice)

    for visit in unpaid_visits:
        visit.payment_status = PaymentStatus.paid
        visit.payment_mode = mode
        visit.paid_at = now

    treatment.status = TreatmentStatus.finished
    treatment.completed_at = date.today()

    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/treatments/{treatment_id}/invoice", response_model=InvoiceOut | None)
def get_invoice(treatment_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)):
    return db.scalar(select(Invoice).where(Invoice.treatment_id == treatment_id))