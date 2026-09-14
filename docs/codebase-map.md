# Codebase map — which file holds what

A reference for finding the right file fast. Update this when a file's job
changes meaningfully, or a new file is added — it's meant to stay accurate,
not be a one-time snapshot. For a record of *specific* changes made over
time (what changed, in which files, and why), see
[changelog.md](changelog.md) instead.

## Big picture

- **Frontend**: React + Vite + TypeScript + Tailwind, in `src/`. Deploys to
  AWS Amplify.
- **Backend**: FastAPI + SQLAlchemy, in `backend/app/`. Deploys as a direct
  AWS Lambda zip (via `backend/build_lambda_package.ps1`, wrapped with
  Mangum) — not through Amplify's function tooling.
- **Database**: PostgreSQL — Neon in production, a dedicated local instance
  in dev (see `backend/README.md`). Schema changes go through Alembic
  migrations in `backend/alembic/versions/`.
- **Custom domain**: `admin.rancodental.com` (Amplify).

---

## Backend — `backend/app/`

| File | Holds |
|---|---|
| `main.py` | FastAPI app setup — CORS, mounts every router from `routers/`. |
| `config.py` | `Settings` (pydantic-settings) — reads `.env`/Lambda env vars: `database_url`, JWT secret, etc. |
| `database.py` | SQLAlchemy engine/session setup, `get_db()` dependency, declarative `Base`. |
| `models.py` | Every SQLAlchemy ORM model (the actual DB schema): `Patient`, `Staff`, `Service`, `Consultation`, `Treatment`, `TreatmentHandoff`, `Visit`, `PrescriptionEntry`, `Invoice`/`InvoiceLine`, `PatientPayment`, plus the `TreatmentStatus`/`PaymentStatus`/`PaymentMode`/`Gender`/`StaffRole`/`ServiceType` enums. |
| `schemas.py` | Every Pydantic request/response schema (`*Create`, `*Out`, `*Update`) — the API's actual input/output contract, separate from the DB models above. |
| `billing_math.py` | Shared pure functions for the two-stage charge calculation: `apply_price_adjustment` (increase-only, stage 1) and `apply_discount` (decrease-only, stage 2, computed on the adjusted price). Used by both `routers/treatments.py` and `routers/consultations.py` so the math can't drift between the two. |
| `pdf.py` | Renders every PDF (prescriptions, patient history, invoices) as HTML strings converted via xhtml2pdf. Holds `BASE_CSS` (all PDF styling — fonts, colors, layout) and the clinic letterhead constants. |
| `seed.py` | One-off dev-database seeder — admin account, sample doctors, service catalog. Run via `python -m app.seed`. |
| `auth/security.py` | Password hashing (bcrypt) and JWT create/decode. |
| `auth/dependencies.py` | FastAPI dependencies `get_current_staff` (any logged-in staff) and `require_admin` (admin-only), used across routers to gate endpoints. |

### `backend/app/routers/` — one file per resource, mounted in `main.py`

| File | Holds |
|---|---|
| `auth.py` | `POST /auth/login`. |
| `staff.py` | Doctor/admin accounts — list/create/update staff. |
| `patients.py` | Patient CRUD, patient list/search. |
| `services.py` | The service catalog (name, category, listed price, active flag). |
| `consultations.py` | Consultation CRUD, the X-ray checkbox, recommended-services note, and `_consultation_charge` (the two-stage adjustment+discount calc for a consultation's fee) plus its discount/adjustment PATCH endpoint. |
| `treatments.py` | Add/start/end/delete a treatment, doctor handoffs, and `_treatment_charge` (same two-stage calc, for a treatment's `service_price`) plus its discount/adjustment PATCH endpoint. |
| `visits.py` | Logging a visit against an ongoing treatment (activity log only — visits don't carry their own price anymore). |
| `prescriptions.py` | Prescription entries (diagnosis/notes/advice) linked to a consultation or visit, plus their edit-history versions. |
| `billing.py` | The patient's one combined bill: `_patient_billing_totals` (billed/paid/outstanding), billing history feed, and payment recording (`PatientPayment`). |
| `invoices.py` | Generating a PDF-backed invoice for one or more treatments/consultations — bills each item's *adjusted* price (not the discounted one; discount stays Billing-tab-only). |
| `documents.py` | The actual PDF download endpoints — pulls data together and calls into `pdf.py` for prescriptions, the full patient history, and invoices. |

### `backend/alembic/versions/`

One file per schema migration, in order. Run `alembic upgrade head` (via the
venv's Python — see `backend/README.md`) to bring a database up to date, or
`alembic revision -m "..."` to start a new one.

---

## Frontend — `src/`

| File | Holds |
|---|---|
| `App.tsx` | Route tree — top-level `<Routes>` wiring every page/layout together. |
| `main.tsx` | React entry point (`createRoot`, context providers). |
| `types/clinical.ts` | Every shared TypeScript type/interface for clinical + billing data (`Patient`, `Treatment`, `Consultation`, `Invoice`, etc.) — the frontend's mirror of the backend's `schemas.py` shapes, in camelCase. |

### `src/lib/` — framework-free helpers

| File | Holds |
|---|---|
| `api.ts` | The base `fetch` wrapper (`api.get/post/patch/delete`) — auth token attach/refresh, base URL from `VITE_API_BASE_URL`. |
| `clinicalApi.ts` | Every actual API call (one function per backend endpoint) plus the `Raw*` (snake_case, as the API sends it) → camelCase mapper for each type. This is the one file that knows the exact backend JSON shape. |
| `currency.ts` | `formatINR` — the one place Rupee formatting happens. |
| `date.ts` | `formatDate`/`formatDateTime` display helpers. |
| `age.ts` | `calculateAge` from a DOB or birth year. |
| `patientId.ts` | `formatPatientId` (→ "RANCO-0012") and `findPatientByCode` (reverse lookup for URLs/search). |
| `patientRoutes.ts` | Shared logic for "is this URL a patient's own page" — used by the layout (mobile tab bar) and `QuickAddMenu`. |
| `rx.ts` | `formatRx` — turns structured `RxItem[]` rows into the plain-text format the backend's prescription notes/PDF expect. |

### `src/state/` — React context providers

| File | Holds |
|---|---|
| `AuthContext.tsx` | Logged-in staff, login/logout, token persistence. |
| `PatientsContext.tsx` | The patient list/search cache shared across pages. |
| `ClinicContext.tsx` | Everything else clinical/billing: doctors, services, and every mutation (add/edit consultation, add/start/end/delete treatment, discount + price-adjustment updates, payments, invoices, prescriptions, PDF view/download). The biggest context — most patient-detail features go through here. |

### `src/components/` — shared, reused widgets

| File | Holds |
|---|---|
| `Button.tsx`, `Pill.tsx`, `Field.tsx` | Base design-system primitives (buttons, status pills, form inputs incl. `SelectField`/`TextareaField`/`ComboField`). |
| `PaymentStatusPill.tsx` | The paid/unpaid pill specifically. |
| `PatientPicker.tsx` | Search-and-pick-a-patient widget (used by `QuickAddMenu`). |
| `QuickAddMenu.tsx` | The floating "+" quick-add menu (new patient / consultation / treatment / payment). |
| `RequireAuth.tsx` | Route guard — redirects to `/login` when logged out. |

### `src/layouts/`

| File | Holds |
|---|---|
| `AdminLayout.tsx` | The logged-in shell — sidebar/top nav, mobile tab bar, wraps every `/admin/*` page. |

### `src/pages/`

| File | Holds |
|---|---|
| `Login.tsx` | The login form. |
| `StyleGuide.tsx` | Unauthenticated `/style-guide` route — a visual reference for the design-system primitives. Not linked from the app nav. |
| `admin/Dashboard.tsx` | The home dashboard — stat tiles, revenue pie charts (has its own copy of the treatment/consultation charge math, kept in sync with `BillingTab.tsx`'s). |
| `admin/PatientList.tsx` | The searchable list of all patients. |
| `admin/NewPatient.tsx` | New-patient form. |
| `admin/Doctors.tsx` | Doctor/staff management (admin-only). |
| `admin/Services.tsx` | Service-catalog management (admin-only). |
| `admin/TreatmentsOverview.tsx` | Clinic-wide list of every treatment across every patient (not per-patient). |
| `admin/BillingOverview.tsx` | Clinic-wide billing view (not per-patient). |
| `admin/PatientDetail.tsx` | The per-patient shell — loads one patient's full clinical data, renders the section nav, provides `PatientDetailContext` to every tab below. |

### `src/pages/admin/patient-detail/` — one patient's tabs

| File | Holds |
|---|---|
| `PatientOverview.tsx` | The patient's profile/summary tab (demographics, quick links). |
| `SectionPages.tsx` | Thin routing wrapper — picks which tab (`Timeline`/`Consultations`/`Treatments`/`Billing`) renders for the current URL, with the shared back-button header. |
| `TimelineTab.tsx` | The combined chronological activity feed (consultations, treatment starts, visits, invoices, payments). |
| `ConsultationsTab.tsx` | Add/edit a consultation — chief complaint, oral exam, X-ray checkbox, Rx, recommended services. |
| `TreatmentsTab.tsx` | Add a treatment (pending), start it, log visits, end it, delete a pending/zero-visit one. |
| `BillingTab.tsx` | The patient's combined bill — payment recording, invoice generation, and the per-item price-adjustment + discount editor (`PricingForm`). The other copy of the charge math lives here (kept in sync with `Dashboard.tsx`'s). |

---

## Naming conventions worth knowing

- Backend JSON is always `snake_case`; the frontend converts to `camelCase`
  immediately in `clinicalApi.ts`'s `Raw*` → typed mappers. Nowhere else in
  the frontend should snake_case appear.
- A schema field only in `models.py` (not `schemas.py`) is an internal
  DB-only detail never exposed over the API.
- "Discount" and "price adjustment" are two deliberately separate, ordered
  concepts (adjustment applied first, discount computed on the adjusted
  amount) — see `billing_math.py`'s module docstring for the full rule.
