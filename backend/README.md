# Ranco Dental CRM — Backend

FastAPI + SQLAlchemy + Alembic + PostgreSQL. Matches the ER model in
`../docs/backend-wireframe.html`.

## First-time setup

Already done in this environment — documented here for reference if this
ever needs to be set up on another machine.

```
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

## Local database

This project uses its **own independent Postgres cluster** on port `5433`,
separate from any other local Postgres install — it was created this way to
avoid touching an existing password-protected instance. Data lives in
`backend/pgdata/` (gitignored).

**It does not start automatically.** After a reboot, start it with:

```
"C:\Program Files\PostgreSQL\18\bin\pg_ctl" -D pgdata -o "-p 5433" -l pgdata.log start
```

Stop it with:

```
"C:\Program Files\PostgreSQL\18\bin\pg_ctl" -D pgdata stop
```

Connection details are in `.env` (gitignored — see `.env.example` for the
shape). Dev credentials: `postgres` / `devpassword123`, database
`ranco_dental_dev`.

## Migrations

```
venv\Scripts\alembic upgrade head          # apply migrations
venv\Scripts\alembic revision --autogenerate -m "message"   # after changing app/models.py
```

## Seed data

```
venv\Scripts\python -m app.seed
```

Creates:

| Email | Password | Role |
|---|---|---|
| admin@rancodental.com | admin123 | admin |
| drkapoor@rancodental.com | doctor123 | doctor |
| drmehta@rancodental.com | doctor123 | doctor |
| drrao@rancodental.com | doctor123 | doctor |

Plus the six-service catalog (RCT, Cleaning, Filling, Extraction, Crown,
Scaling).

## Run the API

```
venv\Scripts\uvicorn app.main:app --reload --port 8000
```

Interactive docs (Swagger UI) at **http://localhost:8000/docs** — every
endpoint, tryable from the browser, with auth built in (click "Authorize"
and paste a bearer token from `/auth/login`).

## Smoke test

`smoke_test.sh` runs the full clinical loop against a live server (login →
create patient → consultation → start treatment → log visit → generate
invoice → verify settlement → add + edit a prescription). Run it with the
API already up:

```
bash smoke_test.sh
```

## What's built

- Auth: JWT login, role-gated endpoints (admin vs doctor)
- Patients, Services (catalog)
- Consultations → Treatments (one-to-one, enforced) → Visits → Invoices
- Treatment doctor handoff, logged
- Prescriptions with full edit history (author-only edits, every revision
  kept as a version)
- Invoice generation settles exactly the visits that were still unpaid —
  no double-counting (this mirrors a bug that was caught and fixed on the
  frontend during testing)

## Not built yet

- Doctor-scoped patient visibility exists (`GET /patients` filters by
  assigned doctor) but hasn't been exercised beyond a manual check
- No GST/tax fields on invoices
- No consent-form or appointment-scheduling entities (see the "Deferred to
  a later phase" section of the wireframe doc)
- Frontend still runs on its own in-memory mock state — not yet wired to
  call this API