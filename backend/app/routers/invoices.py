import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.database import get_db
from app.models import Invoice, InvoiceLine, Staff, Treatment
from app.schemas import GenerateInvoiceRequest, InvoiceOut

router = APIRouter(tags=["invoices"])


@router.post("/patients/{patient_id}/invoices", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def generate_invoice(
    patient_id: uuid.UUID,
    payload: GenerateInvoiceRequest,
    db: Session = Depends(get_db),
    admin: Staff = Depends(require_admin),
):
    """Covers one or more treatments picked together in the Billing tab —
    admin-only, matching every other billing endpoint. Purely a document:
    it records the full listed price of each treatment (no discount, since
    that's a Billing-tab concern) and has no effect on payment status or
    treatment status — money is tracked separately via PatientPayment."""
    treatments = db.scalars(select(Treatment).where(Treatment.id.in_(payload.treatment_ids))).all()
    found_ids = {t.id for t in treatments}
    if found_ids != set(payload.treatment_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more treatments not found")

    for treatment in treatments:
        if treatment.patient_id != patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="A selected treatment doesn't belong to this patient"
            )
        if db.scalar(select(InvoiceLine).where(InvoiceLine.treatment_id == treatment.id)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="A selected treatment already has an invoice"
            )

    listed_total = sum(float(t.service_price) for t in treatments)

    invoice = Invoice(
        listed_total=listed_total,
        discount_type=None,
        discount_value=None,
        discount_total=0.0,
        final_total=listed_total,
        payment_mode=payload.payment_mode,
        issued_by=admin.id,
    )
    db.add(invoice)
    db.flush()  # assign invoice.id before lines reference it

    for treatment in treatments:
        db.add(InvoiceLine(invoice_id=invoice.id, treatment_id=treatment.id, amount=float(treatment.service_price)))

    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/patients/{patient_id}/invoices", response_model=list[InvoiceOut])
def list_invoices(patient_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    treatment_ids = db.scalars(select(Treatment.id).where(Treatment.patient_id == patient_id)).all()
    if not treatment_ids:
        return []
    invoice_ids = db.scalars(
        select(InvoiceLine.invoice_id).where(InvoiceLine.treatment_id.in_(treatment_ids)).distinct()
    ).all()
    if not invoice_ids:
        return []
    return db.scalars(select(Invoice).where(Invoice.id.in_(invoice_ids)).order_by(Invoice.issued_at.desc())).all()


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice
