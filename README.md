# SimplyTrack

MERN time-tracking and task-tracking system for service firms.

## Structure

```
SimplyTrack/
├── frontend/          # React 19 + Vite + Tailwind
└── backend/           # Node.js + Express + MongoDB
```

## Prerequisites

- Node.js 20+
- MongoDB running locally (or update `MONGO_URI`)

## Setup

### Backend

```bash
cd backend
copy .env.example .env   # Windows
npm install
npm run dev
```

API: `http://localhost:5000`


Without SMTP credentials filled in `.env`, OTP codes are printed in the backend console (dev mode).

### Frontend

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

App: `http://localhost:5173` (or `5174` if 5173 is busy)


## Phase 1 (done)

- Separate `frontend` / `backend` folders
- Auth: register (org + owner) → OTP → JWT
- Login → OTP → JWT (httpOnly refresh cookie)
- App shell (sidebar + topbar) + protected routes
- Design system tokens (white / indigo accent)

## Phase 2 (done)

- Stage, Service, Client, User masters (CRUD + ag-Grid lists)
- Permission middleware on all master routes
- `GET /api/permissions/me` for frontend action gating
- Filter bars, Sheet forms, inline active toggles

## Phase 3 (done)

- Task Master: list (ag-Grid + filters), New/Edit task form
- Timer start/stop with closing-note dialog (spellcheck, locked duration)
- Break / Training in topbar with one-session-at-a-time enforcement
- TimeLog corrections (`editLoggedTime`) + task hour rollup

## Phase 4.1 (done)

- Project Master: list + filters (search / client / assignee), add/edit sheet, delete
- Multi-select assignees, client link, estimated hours

## Next

4.2 Reports, Permission Master UI, Settings
5. Dashboard polish
