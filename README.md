
# OpsFlow

An internal operations management platform built for the
Newtonite Software Engineering Challenge.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: FastAPI, Python
- Database: SQLite initially; PostgreSQL migration planned

## Current milestone

Segment 1: Project foundation.

- React application
- FastAPI application
- API health endpoint
- Frontend-to-backend connectivity check

## Run locally


## Backend setup

Run commands from the `backend` directory.

Activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Create a `.env` file based on `.env.example` and set a
random JWT secret.

Apply database migrations:

```powershell
alembic upgrade head
```

Start the API:

```powershell
uvicorn app.main:app --reload
```

API documentation: http://localhost:8000/docs

## Authentication endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

## Database migrations

Generate a migration after changing models:

```powershell
alembic revision --autogenerate -m "describe your change"
```

Apply migrations:

```powershell
alembic upgrade head
```

## Run tests

```powershell
pytest -q
```

## Current limitations

- Team and membership models exist, but team management
  endpoints are not implemented yet.
- Work item management is planned for a later milestone.
- Authentication currently uses bearer tokens.
- SQLite is used for local development.
- Login rate limiting, password reset, and production
  deployment hardening are not implemented yet.

```

Start the frontend in another terminal:

```powershell
cd frontend
npm run dev
```

Frontend: http://localhost:5173

Backend: http://localhost:8000

API documentation: http://localhost:8000/docs
