# OpsFlow

OpsFlow is a small operations workspace for capturing requests, setting priority, tracking status, organizing work into teams, and preserving a readable activity history. It was built for the Newtonite Software Engineering Challenge.

## What works

- Email and password registration and sign-in with bearer-token authentication.
- Personal work items and team workspaces. A team creator becomes its admin; admins can invite existing accounts through the team API.
- Work item create, list, search, status and priority filters, and status changes.
- Team-scoped visibility enforced by the API. A user can see personal items they created or are assigned, plus work in their teams.
- Append-only creation and update activity entries, stored in the same database transaction as an update.
- Optimistic concurrency: every item update supplies its current `version`; stale updates receive HTTP `409` and the UI refreshes the workspace.
- Server-side list pagination. The UI requests a bounded first page rather than loading an unbounded collection.

## Technology

- Frontend: React 19, TypeScript, Vite.
- API: FastAPI, SQLAlchemy 2, Pydantic.
- Database: SQLite for local development; PostgreSQL for a persistent deployment.
- Schema migrations: Alembic.
- Deployment: multi-stage Docker image serving the frontend and API from one origin.

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

## Deploy with Docker

The root `Dockerfile` compiles the frontend, installs the API, and packages them together. The app serves the compiled site and API from the same address. Startup applies Alembic migrations before accepting traffic.

```sh
docker build -t opsflow .
docker run --rm -p 8000:8000 \
  -e JWT_SECRET_KEY="replace-with-a-long-random-secret" \
  -e DATABASE_URL="sqlite:////data/opsflow.db" \
  -v opsflow-data:/data \
  opsflow
```

For a persistent public deployment, attach a managed PostgreSQL database and set `DATABASE_URL` to its connection string. The app accepts `postgres://` and `postgresql://` URLs and selects the psycopg driver. Keep `JWT_SECRET_KEY` in the hosting provider's secret store. Use a managed database with automated backups; do not use the container's filesystem for production SQLite data. Configure the platform health check to `GET /api/health` and expose the service's assigned port.

### Render deployment

1. Push this repository to your Git provider and create a Render **Web Service** from it.
2. Choose the **Docker** runtime and leave the Dockerfile path as `./Dockerfile`.
3. Create a managed PostgreSQL database in Render and copy its **internal** connection string into the web service's `DATABASE_URL` environment variable.
4. Add `JWT_SECRET_KEY` as a generated secret (at least 32 random characters). The single-origin setup does not need a production `CORS_ORIGINS` value.
5. Set the health check path to `/api/health` and deploy. The container runs database migrations on startup; `/` serves the website.

For any hosting platform, use its supported PostgreSQL URL and secret manager. The container listens on `PORT` when the platform provides it.

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

- Team members can be added by email only after they register; invitations, offboarding, and richer role administration are not implemented.
- Password reset, email verification, login throttling, and token revocation are not implemented. Use a managed secret and HTTPS in a deployment.
- The browser stores the bearer token in local storage. A production identity review may prefer secure, same-site cookies and a CSRF strategy.
- Activity currently covers item creation and updates, and identifies actors by ID. Comment threads and richer human-readable diffs are future work.
- The workspace currently loads the first page of up to 100 work items. The API pagination is ready for a paginated UI, but the browser does not yet offer page navigation.
- SQLite is appropriate for local use. Production should use PostgreSQL with backups and operational monitoring.
- The app is a focused first release, not a full enterprise workflow engine. Approval policies, notifications, background jobs, and team assignment UI remain future work.
