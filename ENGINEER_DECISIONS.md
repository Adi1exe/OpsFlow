# Engineering decisions

This document records the choices made for the Newtonite Software Engineering Challenge. The goal was to deliver a small working system and make its correctness boundaries visible.

## 1. Keep work items and activity in a relational database

Users, teams, memberships, work items, and audit entries use SQLAlchemy models with explicit foreign keys and indexes on the common lookup fields. The work-item list is filtered and paginated in SQL, so the API does not need to read the full table into memory. SQLite keeps local setup simple; PostgreSQL is supported for a persistent deployment.

**Trade-off:** the activity table is append-only by application convention rather than protected by database permissions. A production system would likely place audit data behind stricter database roles and retention controls.

## 2. Enforce visibility in the API

Personal work is visible to its creator and assignee. Team work is visible to team members. The API returns `404` for inaccessible items so item existence is not disclosed through the read routes. Team creators receive the admin role, and team leads and admins can add registered accounts. Team leads may not appoint other team leads.

**Trade-off:** registration is open and team invitation is an API operation; there is no email invitation or self-service membership request flow. The frontend does not decide access by hiding controls.

## 3. Use optimistic concurrency for edits

Each work item has a monotonically increasing `version`. A client must send the version it read when it updates the item. The database update matches both item ID and version, and increments the version atomically. If another edit already won, the API returns `409 Conflict`; the browser reloads the current state.

**Trade-off:** this rejects an entire stale update rather than attempting to merge fields. That keeps the outcome predictable and lets a person review the latest state before retrying.

## 4. Commit the activity entry with the item change

Creating an item writes its creation event in the same transaction. Updating an item writes the versioned change and a before/after summary in one transaction. Activity reads are scoped to an accessible item and paginated newest first.

**Trade-off:** activity is synchronous because it is a correctness record for the primary operation. Notifications and enrichment are not implemented; if added, they should run asynchronously from a durable outbox so a failed worker does not erase a committed work item.

## 5. Deploy the frontend and API as separate services

The Vite frontend is built as static files and hosted on a static-site platform. FastAPI runs as a native Python web service, and PostgreSQL is managed separately. The frontend receives the API's public URL through `VITE_API_BASE_URL`; the API allows the deployed frontend origin through `CORS_ORIGINS`.

**Trade-off:** each service can be deployed and scaled independently, but the deployment requires correct frontend/API URLs, explicit CORS configuration, and coordinated environment settings.

## Assumptions and intentionally deferred work

- An account creator is allowed to create a team and becomes that team's first admin; there is no global user-administration workflow yet.
- Team members can work on items in their team. The first interface provides team creation and basic status/priority work; it does not yet provide a rich assignment editor or member-management screen.
- The initial UI loads at most 100 items in one request. The API supports pagination, but the frontend needs page navigation before it is suitable for very large personal/team queues.
- Login rate limiting, password recovery, email verification, cookie-based sessions, detailed actor names in activity, full audit retention controls, background jobs, approvals, notifications, and production observability remain follow-up work.

## Risk-focused checks

The backend tests exercise stale writes, resource visibility, and activity persistence. These cases protect against overwriting a newer change, exposing another user's work, and silently losing a history record.
