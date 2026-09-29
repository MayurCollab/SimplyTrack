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

## Platform phases (done)

1. Auth, app shell, design system
2. Masters (stages, services, clients, users) + permissions middleware
3. Task Master, timers, closing notes, break/training
4.1 Project Master

## Task Management requirements (done)

| Phase | Scope |
|-------|--------|
| 0 | Service turnaround + compliance type, permissions, default workflow stages |
| 1 | Immutable Task ID (`TSK-000001`), server-side auto title, Remarks |
| 2 | Extra date fields, service-specific compliance period, auto Target Date |
| 3 | Mark Complete / Ignore (Manager / Super Admin) |
| 4 | Status workflow prompts (Query Sent / Reply Received dates) |
| 5 | Recurring tasks + suggested next-period tasks |
| 6 | Migrations, list filters (lifecycle, target date), docs |

## Next

- Reports, Permission Master UI, Settings
- Dashboard polish
