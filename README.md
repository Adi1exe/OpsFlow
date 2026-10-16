
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

Start the backend from the repository root:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Start the frontend in another terminal:

```powershell
cd frontend
npm run dev
```

Frontend: http://localhost:5173

Backend: http://localhost:8000

API documentation: http://localhost:8000/docs
