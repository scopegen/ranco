# Ranco Dental CRM

Clinic management system for Ranco Dental — patients, consultations,
treatments, visits, billing, and prescriptions, with role-based access for
Admin and Doctor staff.

## Stack

- **Frontend**: React + TypeScript + Vite, Tailwind CSS
- **Backend**: FastAPI + SQLAlchemy + Alembic, Python
- **Database**: PostgreSQL

## Project layout

```
src/          React frontend
backend/      FastAPI backend (see backend/README.md for setup/run instructions)
docs/         Design docs — data model (ER diagram), system overview, wireframes
```

## Running it locally

**Frontend:**

```
npm install
npm run dev
```

Opens at http://localhost:5173.

**Backend:** see [backend/README.md](backend/README.md) — covers first-time
setup, starting Postgres, migrations, seed data, and running the API
(http://localhost:8000/docs for interactive API docs).

The frontend expects the backend running at `http://localhost:8000`.

## Docs

- [docs/backend-wireframe.html](docs/backend-wireframe.html) — entities,
  relationships, and access rules
- [docs/system-overview.html](docs/system-overview.html) — plain-English
  walkthrough of how the whole system fits together