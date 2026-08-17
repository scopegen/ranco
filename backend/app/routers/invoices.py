import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.database import get_db
from app.models import Invoice, InvoiceLine, PaymentMode, Staff, Treatment, TreatmentPayment, TreatmentStatus
from app.routers.treatments import _billing_summary
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
    admin-only, matching every other billing endpoint."""
    treatments = db.scalars(select(Treatment).where(Treatment.id.in_(payload.treatment_ids))).all()
    found_ids = {t.id for t in treatments}
    if found_ids != set(payload.treatment_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more treatments not found")

    for treatment in treatments:
        if treatment.patient_id != patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="A selected treatment doesn't belong to this patient"
            )
        if treatment.status == TreatmentStatus.finished:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="A selected treatment is already finished/invoiced"
            )
        if db.scalar(select(InvoiceLine).where(InvoiceLine.treatment_id == treatment.id)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="A selected treatment already has an invoice"
            )

    # Each treatment's own pending balance (service price − its own discount
    # − whatever's already been paid toward it) — the same number shown on
    # its Billing tab card.
    billing_by_id = {t.id: _billing_summary(db, t) for t in treatments}
    amounts = {tid: b.amount_pending for tid, b in billing_by_id.items()}
    listed_total = sum(amounts.values())
    mode = payload.payment_mode or PaymentMode.cash

    discount_total = 0.0
    if payload.discount_type and payload.discount_value:
        if payload.discount_type == "percent":
            discount_total = listed_total * (payload.discount_value / 100)
        else:
            discount_total = payload.discount_value
        # Clamp — a flat-amount discount larger than the bill itself
        # shouldn't be able to push the final total negative.
        discount_total = min(discount_total, listed_total)

    invoice = Invoice(
        listed_total=listed_total,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        discount_total=discount_total,
        final_total=listed_total - discount_total,
        payment_mode=mode,
        issued_by=admin.id,
    )
    db.add(invoice)
    db.flush()  # assign invoice.id before lines/payments reference it

    for treatment in treatments:
        amount = amounts[treatment.id]
        db.add(InvoiceLine(invoice_id=invoice.id, treatment_id=treatment.id, amount=amount))

        # Spread the invoice-level discount proportionally across its
        # treatments rather than dumping it all on whichever comes first.
        share_discount = (amount / listed_total * discount_total) if listed_total else 0.0
        settle_amount = amount - share_discount

        if share_discount > 0:
            # Fold this treatment's share of the invoice discount into its
            # own discount (as a flat amount, on top of whatever discount it
            # already had) — otherwise, after settle_amount is recorded
            # below, the treatment's own billing would still show a pending
            # balance equal to the discount it was just given, even though
            # the invoice just closed it out.
            treatment.discount_type = "amount"
            treatment.discount_value = billing_by_id[treatment.id].discount_amount + share_discount

        if settle_amount > 0:
            db.add(
                TreatmentPayment(
                    treatment_id=treatment.id,
                    amount=settle_amount,
                    payment_mode=mode,
                    recorded_by=admin.id,
                )
            )

        treatment.status = TreatmentStatus.finished
        treatment.completed_at = date.today()

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
