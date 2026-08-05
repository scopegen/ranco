from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.config import settings
from app.routers import (
    auth,
    consultations,
    documents,
    invoices,
    patients,
    prescriptions,
    services,
    staff,
    treatments,
    visits,
)

app = FastAPI(title="Ranco Dental CRM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Content-Disposition isn't on the browser's default-exposed header list —
    # without this, fetch() can't read the filename the backend sets, and the
    # frontend has to fall back to a generic name for every PDF download.
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(staff.router)
app.include_router(patients.router)
app.include_router(services.router)
app.include_router(consultations.router)
app.include_router(treatments.router)
app.include_router(visits.router)
app.include_router(invoices.router)
app.include_router(prescriptions.router)
app.include_router(documents.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")