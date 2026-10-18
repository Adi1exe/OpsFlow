# OpsFlow

OpsFlow is a small operations workspace for capturing requests, setting priority, tracking status, organizing work into teams, and preserving a readable activity history. It was built for the Newtonite Software Engineering Challenge.

## What works

- Email and password registration and sign-in with bearer-token authentication.
- Personal work items and team workspaces. A team creator becomes its admin; admins can invite existing accounts through the team API.
- Work item creation, listing, search, status and priority filters, and status changes.
- Team-scoped visibility enforced by the API. A user can see personal items they created or are assigned, plus work in their teams.
- Creation and update activity entries, stored in the same database transaction as each item change.
- Optimistic concurrency: every item update supplies its current `version`; stale updates receive HTTP `409` and the UI refreshes the workspace.
- Server-side list pagination. The UI requests a bounded first page rather than loading an unbounded collection.

## Technology

- Frontend: React 19, TypeScript, Vite.
- API: FastAPI, SQLAlchemy 2, Pydantic.
- Database: SQLite for local development; PostgreSQL for a persistent deployment.
- Schema migrations: Alembic.
- Deployment: static frontend and API deployed as separate services, backed by managed PostgreSQL.

## Run locally

Requirements: Python 3.11 or later, Node.js 20 or later, and npm.

### 1. Configure and start the API

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set a unique random `JWT_SECRET_KEY` in `backend/.env`. Then run:

```powershell
alembic upgrade head
uvicorn app.main:app --reload
```

The API is at <http://localhost:8000>; interactive API documentation is at <http://localhost:8000/docs>.

### 2. Start the frontend

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. The frontend talks to the API at `http://localhost:8000` by default. To use a different API address, set `VITE_API_BASE_URL` before building or add it to a local frontend env file.

### Tests and checks

From `backend`, run the API tests with `pytest -q`. From `frontend`, run `npm run lint` and `npm run build`.

The API tests cover registration and login, team and resource visibility, stale write rejection, and persisted activity history.

## Deploy the website

Deploy the frontend and API as separate services. This uses the providers' native Node.js and Python runtimes with a managed PostgreSQL database; no container build is needed.

### Render API and database

1. Create a managed PostgreSQL database in Render and copy its **internal** connection string.
2. Create a Render **Web Service** from this repository, set the root directory to `backend`, and select the native **Python** runtime.
3. Use `pip install -r requirements.txt` as the build command.
4. Use `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT` as the start command. Migrations run before the API accepts traffic.
5. Set `DATABASE_URL` to the Render PostgreSQL connection string, `JWT_SECRET_KEY` to a newly generated secret of at least 32 random characters, and `CORS_ORIGINS` to the exact production URL of the frontend (for example, `https://opsflow.vercel.app`). Set the health check path to `/api/health`.

The API accepts `postgres://` and `postgresql://` URLs and selects the psycopg driver. Keep secrets in the hosting provider's environment settings. Use a managed database with automated backups; the local SQLite file is for development only.

### Vercel frontend

1. Create a Vercel project from the same repository and set the root directory to `frontend`.
2. Use `npm run build` as the build command and `dist` as the output directory.
3. Add `VITE_API_BASE_URL` with the public base URL of the Render API, such as `https://opsflow-api.onrender.com` (no trailing slash), then deploy.

For another static hosting provider, publish `frontend/dist` and set `VITE_API_BASE_URL` to the API's public URL. Add the deployed frontend origin to the API's comma-separated `CORS_ORIGINS` setting. The Vite variable is included in browser code, so it should contain only the public API URL, never a secret.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Exchange credentials for a bearer token |
| `GET` | `/api/auth/me` | Read the signed-in account |
| `GET`, `POST` | `/api/teams` | List your teams or create a team |
| `GET`, `POST` | `/api/teams/{team_id}/members` | List members or add an existing account (team lead/admin) |
| `GET`, `POST` | `/api/work-items/` | List your visible work or create an item |
| `GET`, `PATCH` | `/api/work-items/{item_id}` | Read or version-checked update |
| `GET` | `/api/work-items/{item_id}/activity` | Read paginated item activity |
| `GET` | `/api/health` | Health check |

Pass `Authorization: Bearer <access_token>` to protected routes. Work item listing supports `search`, `status`, `priority`, `assignee_id`, `team_id`, `page`, and `page_size` parameters. A `PATCH` body includes the version the client read, for example `{"status":"in_progress","version":1}`.

## Engineering notes

See [ENGINEER_DECISIONS.md](ENGINEER_DECISIONS.md) for the main trade-offs and assumptions.

## Known limitations

- Team members can be added by email only after they register; email invitations, offboarding, and richer role administration are not implemented.
- Password reset, email verification, login throttling, and token revocation are not implemented. Use a managed secret and HTTPS in a deployment.
- The browser stores the bearer token in local storage. A production identity review may prefer secure, same-site cookies and a CSRF strategy.
- Activity currently covers item creation and updates, and identifies actors by ID. Comment threads and richer human-readable diffs are future work.
- The workspace currently loads the first page of up to 100 work items. The API pagination is ready for a paginated UI, but the browser does not yet offer page navigation.
- SQLite is appropriate for local use. Production should use PostgreSQL with backups and operational monitoring.
- The app is a focused first release, not a full enterprise workflow engine. Approval policies, notifications, background jobs, and team assignment UI remain future work.
