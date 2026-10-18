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
- Deployment: Vercel Services for the frontend and API, backed by Neon PostgreSQL.

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

## Deploy with Vercel and Neon

The repository's root `vercel.json` configures two Vercel services: the Vite frontend and the FastAPI backend. Neon provides the persistent PostgreSQL database. Keep the Vercel project root at the repository root so Vercel can read `vercel.json` and both service directories.

### Configure Neon

1. Create a Neon project and database.
2. In Neon **Connect**, copy the PostgreSQL connection string. Use the pooled connection string for the serverless Vercel backend, and keep the URL private.
3. From PowerShell, run the existing Alembic migrations against Neon from the `backend` directory. Supply the Neon URL and the same JWT secret you will configure in Vercel:

   ```powershell
   cd backend
   $env:DATABASE_URL = "your Neon connection string"
   $env:JWT_SECRET_KEY = "your deployment JWT secret"
   python -m alembic upgrade head
   ```

   The successful output should show both revisions under `backend/alembic/versions` being applied. This creates the schema in Neon; `alembic upgrade head` does not create or modify migration script files. Run migrations again after adding a future migration.

### Configure Vercel

1. Import the repository as a Vercel project and leave the **Root Directory** set to the repository root.
2. In the project's framework/build settings, select **Services**. The `services` configuration in `vercel.json` is used only when the project is configured to build as Services.
3. Add these environment variables to each deployment environment you use (at least **Production**):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled PostgreSQL connection string |
   | `JWT_SECRET_KEY` | A unique, random secret (at least 32 characters) |

   Do not add the database URL or JWT secret as `VITE_` variables; those would be exposed to browser code. The frontend calls the backend through same-origin `/api` routes, so `VITE_API_BASE_URL` is not needed for this Vercel setup.
4. Deploy or redeploy after saving the environment variables. The API uses `DATABASE_URL` instead of the local SQLite default when it connects to the database.
5. Check `https://<your-deployment-domain>/api/health`. Then register an account and sign in.

For local development, SQLite remains the default. Never use Vercel's local function filesystem as the production database: it is not durable or shared between function instances. The settings code accepts Neon `postgres://` and `postgresql://` URLs and selects the psycopg driver.

For a separate frontend host and API host, set `VITE_API_BASE_URL` to the public API base URL and configure the API's `CORS_ORIGINS` with the frontend origin.

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
