import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import pdf
from app.auth.dependencies import get_current_staff
from app.database import get_db
from app.models import Consultation, Invoice, Patient, PrescriptionEntry, Service, Staff, Treatment, Visit

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
    invoices_by_treatment: dict = {}
    if treatment_ids:
        for v in db.scalars(select(Visit).where(Visit.treatment_id.in_(treatment_ids))):
            visits_by_treatment.setdefault(v.treatment_id, []).append(v)
        for inv in db.scalars(select(Invoice).where(Invoice.treatment_id.in_(treatment_ids))):
            invoices_by_treatment[inv.treatment_id] = inv

    staff_ids = {c.doctor_id for c in consultations} | {t.doctor_id for t in treatments} | {
        e.added_by for e in prescriptions
    }
    service_ids = {t.service_id for t in treatments} | {
        c.recommended_service_id for c in consultations if c.recommended_service_id
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
        invoices_by_treatment,
        prescriptions,
    )
    return _pdf_response(content, f"history-{pdf.patient_id_str(patient.patient_number)}.pdf")
