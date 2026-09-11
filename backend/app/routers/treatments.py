import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_staff, require_admin
from app.database import get_db
from app.models import (
    InvoiceLine,
    Patient,
    Service,
    Staff,
    Treatment,
    TreatmentHandoff,
    TreatmentPayment,
    TreatmentStatus,
    Visit,
)
from app.schemas import (
    TreatmentCreate,
    TreatmentDiscountUpdate,
    TreatmentHandoffCreate,
    TreatmentHandoffOut,
    TreatmentOut,
    TreatmentStartRequest,
)

router = APIRouter(tags=["treatments"])


def _treatment_charge(treatment: Treatment) -> tuple[float, float, float]:
    """(service_price, discount_amount, charge) — charge is what this one
    treatment contributes to the patient's combined bill. service_price is
    the snapshot taken when the treatment was added (see the model field),
    never re-derived from the service catalog. Callers are responsible for
    excluding pending treatments — this doesn't charge for anything, it just
    computes what a treatment's row would cost if it did."""
    service_price = float(treatment.service_price)
    discount_amount = 0.0
    if treatment.discount_type and treatment.discount_value:
        if treatment.discount_type == "percent":
            discount_amount = service_price * (float(treatment.discount_value) / 100)
        else:
            discount_amount = float(treatment.discount_value)
        discount_amount = min(discount_amount, service_price)
    return service_price, discount_amount, service_price - discount_amount


@router.post("/patients/{patient_id}/treatments", response_model=TreatmentOut, status_code=status.HTTP_201_CREATED)
def add_treatment(
    patient_id: uuid.UUID,
    payload: TreatmentCreate,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    """Adds a treatment straight from the Treatments tab — pending, not
    tied to any consultation, not started, not billed yet. See
    start_treatment below for the separate step that actually starts it."""
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    service = db.get(Service, payload.service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    treatment = Treatment(
        patient_id=patient_id,
        service_id=payload.service_id,
        doctor_id=payload.doctor_id,
        status=TreatmentStatus.pending,
        # Snapshot today's catalog price now — see the comment on the model
        # field for why this must not be a live lookup. Doesn't affect
        # billing yet; that only happens once the treatment actually starts.
        service_price=service.listed_price,
    )
    db.add(treatment)
    db.commit()
    db.refresh(treatment)
    return treatment


@router.post("/treatments/{treatment_id}/start", response_model=TreatmentOut)
def start_treatment(
    treatment_id: uuid.UUID,
    payload: TreatmentStartRequest,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    """Moves a pending treatment to ongoing — from this point on it counts
    toward the patient's combined bill (see _patient_billing_totals/
    get_billing_history, which both exclude pending treatments)."""
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    if treatment.status != TreatmentStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a pending treatment can be started")

    treatment.status = TreatmentStatus.ongoing
    treatment.started_at = payload.started_at
    db.commit()
    db.refresh(treatment)
    return treatment


@router.get("/patients/{patient_id}/treatments", response_model=list[TreatmentOut])
def list_treatments(patient_id: uuid.UUID, db: Session = Depends(get_db), _current: Staff = Depends(get_current_staff)):
    return db.scalars(
        select(Treatment).where(Treatment.patient_id == patient_id).order_by(Treatment.started_at.desc())
    ).all()


@router.post("/treatments/{treatment_id}/handoff", response_model=TreatmentHandoffOut, status_code=status.HTTP_201_CREATED)
def handoff_treatment(
    treatment_id: uuid.UUID,
    payload: TreatmentHandoffCreate,
    db: Session = Depends(get_db),
    current: Staff = Depends(get_current_staff),
):
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")

    handoff = TreatmentHandoff(
        treatment_id=treatment_id,
        from_doctor_id=treatment.doctor_id,
        to_doctor_id=payload.to_doctor_id,
        changed_by=current.id,
        reason=payload.reason,
    )
    treatment.doctor_id = payload.to_doctor_id
    db.add(handoff)
    db.commit()
    db.refresh(handoff)
    return handoff


@router.patch("/treatments/{treatment_id}/discount", response_model=TreatmentOut)
def update_treatment_discount(
    treatment_id: uuid.UUID,
    payload: TreatmentDiscountUpdate,
    db: Session = Depends(get_db),
    _admin: Staff = Depends(require_admin),
):
    """Admin-only — discounts stay a per-service concern even though payment
    itself is now tracked on the patient's combined bill, not per-service."""
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    treatment.discount_type = payload.discount_type
    treatment.discount_value = payload.discount_value
    db.commit()
    db.refresh(treatment)
    return treatment


@router.post("/treatments/{treatment_id}/end", response_model=TreatmentOut)
def end_treatment(
    treatment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    """Marks a treatment finished, completed today — one click, no form.
    Same access as logging a visit (any staff, not admin-only); billing is
    untouched by this, same as everything else in the new combined-bill
    model."""
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    if treatment.status == TreatmentStatus.finished:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Treatment is already finished")
    treatment.status = TreatmentStatus.finished
    treatment.completed_at = date.today()
    db.commit()
    db.refresh(treatment)
    return treatment


@router.delete("/treatments/{treatment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_treatment(
    treatment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current: Staff = Depends(get_current_staff),
):
    """Removes a treatment the patient decided not to go ahead with — only
    while it hasn't actually started: either still pending (added but never
    started), or ongoing with no visit logged against it yet — a finished
    treatment, or one with a visit, is a real record and stays. Deleting it
    also removes its service_price contribution to the patient's combined
    bill, for the ongoing case (see the model comment on
    Treatment.service_price — a pending treatment isn't billed yet at all)."""
    treatment = db.get(Treatment, treatment_id)
    if treatment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment not found")
    if treatment.status == TreatmentStatus.finished:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A finished treatment can't be deleted")
    if db.scalar(select(Visit).where(Visit.treatment_id == treatment_id)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Can't delete a treatment that already has visits logged"
        )
    # Defensive — none of these should exist on a treatment with zero visits,
    # but don't silently orphan them if they somehow do.
    if db.scalar(select(TreatmentHandoff).where(TreatmentHandoff.treatment_id == treatment_id)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Can't delete a treatment with handoff history")
    if db.scalar(select(TreatmentPayment).where(TreatmentPayment.treatment_id == treatment_id)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Can't delete a treatment with payments recorded")
    if db.scalar(select(InvoiceLine).where(InvoiceLine.treatment_id == treatment_id)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Can't delete a treatment already on an invoice")

    db.delete(treatment)
    db.commit()
