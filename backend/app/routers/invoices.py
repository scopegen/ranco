import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.database import get_db
from app.models import Consultation, Invoice, InvoiceLine, Staff, Treatment
from app.schemas import GenerateInvoiceRequest, InvoiceOut

router = APIRouter(tags=["invoices"])


@router.post("/patients/{patient_id}/invoices", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def generate_invoice(
    patient_id: uuid.UUID,
    payload: GenerateInvoiceRequest,
    db: Session = Depends(get_db),
    admin: Staff = Depends(require_admin),
):
    """Covers one or more treatments and/or consultations picked together in
    the Billing tab — admin-only, matching every other billing endpoint.
    Purely a document: it records the full listed price of each item (no
    discount, since that's a Billing-tab concern) and has no effect on
    payment status or treatment status — money is tracked separately via
    PatientPayment."""
    treatments = db.scalars(select(Treatment).where(Treatment.id.in_(payload.treatment_ids))).all()
    found_treatment_ids = {t.id for t in treatments}
    if found_treatment_ids != set(payload.treatment_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more treatments not found")

    consultations = db.scalars(select(Consultation).where(Consultation.id.in_(payload.consultation_ids))).all()
    found_consultation_ids = {c.id for c in consultations}
    if found_consultation_ids != set(payload.consultation_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more consultations not found")

    for treatment in treatments:
        if treatment.patient_id != patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="A selected treatment doesn't belong to this patient"
            )
        if db.scalar(select(InvoiceLine).where(InvoiceLine.treatment_id == treatment.id)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="A selected treatment already has an invoice"
            )

    for consultation in consultations:
        if consultation.patient_id != patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A selected consultation doesn't belong to this patient",
            )
        if db.scalar(select(InvoiceLine).where(InvoiceLine.consultation_id == consultation.id)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="A selected consultation already has an invoice"
            )

    listed_total = sum(float(t.service_price) for t in treatments) + sum(float(c.fee) for c in consultations)

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
    for consultation in consultations:
        db.add(InvoiceLine(invoice_id=invoice.id, consultation_id=consultation.id, amount=float(consultation.fee)))

    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/patients/{patient_id}/invoices", response_model=list[InvoiceOut])
def list_invoices(patient_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    treatment_ids = db.scalars(select(Treatment.id).where(Treatment.patient_id == patient_id)).all()
    consultation_ids = db.scalars(select(Consultation.id).where(Consultation.patient_id == patient_id)).all()
    if not treatment_ids and not consultation_ids:
        return []
    invoice_ids = set(
        db.scalars(
            select(InvoiceLine.invoice_id).where(InvoiceLine.treatment_id.in_(treatment_ids)).distinct()
        ).all()
    ) | set(
        db.scalars(
            select(InvoiceLine.invoice_id).where(InvoiceLine.consultation_id.in_(consultation_ids)).distinct()
        ).all()
    )
    if not invoice_ids:
        return []
    return db.scalars(select(Invoice).where(Invoice.id.in_(invoice_ids)).order_by(Invoice.issued_at.desc())).all()


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice
