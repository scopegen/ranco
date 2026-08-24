import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import pdf
from app.auth.dependencies import get_current_staff, require_admin
from app.database import get_db
from app.models import Consultation, Invoice, InvoiceLine, Patient, PrescriptionEntry, Service, Staff, Treatment, Visit
from app.routers.treatments import _billing_summary

router = APIRouter(tags=["documents"])


def _pdf_response(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/patients/{patient_id}/prescriptions/pdf")
def download_prescriptions_pdf(
    patient_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)
):
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    entries = db.scalars(
        select(PrescriptionEntry)
        .where(PrescriptionEntry.patient_id == patient_id)
        .options(selectinload(PrescriptionEntry.versions))
    ).all()

    staff_ids = {e.added_by for e in entries}
    staff_by_id = {s.id: s for s in db.scalars(select(Staff).where(Staff.id.in_(staff_ids)))} if staff_ids else {}

    content = pdf.render_prescription_pdf(patient, entries, staff_by_id)
    return _pdf_response(content, f"prescriptions-{pdf.patient_id_str(patient.patient_number)}.pdf")


@router.get("/patients/{patient_id}/history/pdf")
def download_history_pdf(
    patient_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)
):
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    consultations = list(db.scalars(select(Consultation).where(Consultation.patient_id == patient_id)))
    treatments = list(db.scalars(select(Treatment).where(Treatment.patient_id == patient_id)))
    prescriptions = list(db.scalars(select(PrescriptionEntry).where(PrescriptionEntry.patient_id == patient_id)))

    treatment_ids = [t.id for t in treatments]
    visits_by_treatment: dict = {}
    treatment_billing_by_id: dict = {}
    invoice_by_treatment: dict = {}
    if treatment_ids:
        for v in db.scalars(select(Visit).where(Visit.treatment_id.in_(treatment_ids))):
            visits_by_treatment.setdefault(v.treatment_id, []).append(v)
        for t in treatments:
            treatment_billing_by_id[t.id] = _billing_summary(db, t)
        lines = list(db.scalars(select(InvoiceLine).where(InvoiceLine.treatment_id.in_(treatment_ids))))
        if lines:
            invoices = {
                inv.id: inv for inv in db.scalars(select(Invoice).where(Invoice.id.in_({l.invoice_id for l in lines})))
            }
            for line in lines:
                invoice_by_treatment[line.treatment_id] = (invoices[line.invoice_id], float(line.amount))

    staff_ids = {c.doctor_id for c in consultations} | {t.doctor_id for t in treatments} | {
        e.added_by for e in prescriptions
    }
    service_ids = {t.service_id for t in treatments} | {
        sid for c in consultations for sid in c.recommended_service_ids
    }
    staff_by_id = {s.id: s for s in db.scalars(select(Staff).where(Staff.id.in_(staff_ids)))} if staff_ids else {}
    service_by_id = (
        {s.id: s for s in db.scalars(select(Service).where(Service.id.in_(service_ids)))} if service_ids else {}
    )

    content = pdf.render_history_pdf(
        patient,
        staff_by_id,
        service_by_id,
        consultations,
        treatments,
        visits_by_treatment,
        treatment_billing_by_id,
        invoice_by_treatment,
        prescriptions,
    )
    return _pdf_response(content, f"history-{pdf.patient_id_str(patient.patient_number)}.pdf")


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: uuid.UUID, db: Session = Depends(get_db), _admin: Staff = Depends(require_admin)):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    lines = list(db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice_id)))
    if not lines:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice has no treatments")

    treatments = {
        t.id: t for t in db.scalars(select(Treatment).where(Treatment.id.in_({l.treatment_id for l in lines})))
    }
    first_treatment = next(iter(treatments.values()))
    patient = db.get(Patient, first_treatment.patient_id)

    service_ids = {t.service_id for t in treatments.values()}
    doctor_ids = {t.doctor_id for t in treatments.values()}
    service_by_id = {s.id: s for s in db.scalars(select(Service).where(Service.id.in_(service_ids)))}
    doctor_by_id = {s.id: s for s in db.scalars(select(Staff).where(Staff.id.in_(doctor_ids)))}

    # line.amount is each treatment's pre-discount pending amount at the time
    # of invoicing — spread the invoice's overall discount across lines the
    # same proportional way generate_invoice() does, so what prints here is
    # each service's exact charged amount, not the pre-discount figure.
    listed_total = float(invoice.listed_total)
    discount_total = float(invoice.discount_total)
    pdf_lines = [
        {
            "service_name": service_by_id[t.service_id].name if t.service_id in service_by_id else "Unknown",
            "doctor_name": doctor_by_id[t.doctor_id].name if t.doctor_id in doctor_by_id else "Unknown",
            "amount": float(line.amount)
            - (float(line.amount) / listed_total * discount_total if listed_total else 0.0),
        }
        for line in lines
        if (t := treatments.get(line.treatment_id)) is not None
    ]

    content = pdf.render_invoice_pdf(patient, pdf_lines, invoice)
    return _pdf_response(content, f"invoice-{pdf.patient_id_str(patient.patient_number)}-{invoice_id.hex[:8]}.pdf")
