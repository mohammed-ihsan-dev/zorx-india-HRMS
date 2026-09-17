# ZORX INDIA — Office Management System

A full-stack MERN office management system for **ZORX INDIA**: employee management, location-verified attendance, leave management, task management, notifications, announcements, reporting, and role-based admin/HR tooling.

## Features

- **Authentication & RBAC** — JWT auth, bcrypt password hashing, 5 roles (`SUPER_ADMIN`, `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`) enforced on the backend, not just the UI.
- **Location-verified attendance** — Employees check in/out with the browser Geolocation API; the **backend** recalculates the distance to the office (Haversine formula) and is the sole authority on whether a punch is allowed. The frontend's own radius check is a UX convenience only.
- **Leave management** — Apply, cancel, approve, reject; per-type leave balances (Casual/Sick/Earned) with automatic deduction/restoration.
- **Task management** — Assign, track status (`TODO → IN_PROGRESS → IN_REVIEW → COMPLETED`/`CANCELLED`), priorities, due dates.
- **Notifications & Announcements** — In-app notification bell with unread counts; company-wide announcements with priority/audience/expiry.
- **Admin/HR dashboard** — Live stats (present/absent/late/on leave), task overview chart, recent audit activity.
- **Reports** — Attendance, leave, employee, and task reports with CSV export.
- **Audit logs** — Every sensitive action (employee changes, leave decisions, task assignment, office settings changes) is recorded.
- **Office Settings** — Office location, attendance radius, working hours, break duration, late/half-day thresholds — all editable by Admin/Super Admin, with a "use my current location" helper.

## Tech Stack

**Frontend:** React 18 + Vite, JavaScript (no TypeScript), React Router, Axios, Tailwind CSS, Lucide React icons, Recharts.

**Backend:** Node.js + Express (ESM), MongoDB + Mongoose, JWT, bcryptjs, Zod validation, Helmet, CORS, rate limiting, Mongo query sanitization.

**Database:** MongoDB Atlas (database name: `zorx-ms`).

## Project Structure

```
zorx-ms/
├── client/                 # React + Vite frontend
│   └── src/
│       ├── components/     # Reusable UI (Button, Modal, Table, Badge, …)
│       ├── layouts/        # EmployeeLayout, AdminLayout
│       ├── pages/          # employee/, admin/, auth/
│       ├── features/       # Feature-specific components (attendance widget, modals)
│       ├── services/       # One Axios wrapper per API resource
│       ├── hooks/          # useAuth, useToast, useGeolocation
│       ├── context/        # AuthContext, ToastContext
│       └── routes/         # ProtectedRoute, RoleRoute, nav config
└── server/                 # Express + MongoDB backend
    └── src/
        ├── config/         # env, db connection
        ├── models/         # Mongoose schemas
        ├── controllers/    # Request handlers
        ├── services/       # Business logic (attendanceService, leaveService, …)
        ├── middleware/     # auth, rbac, validation, error handling
        ├── validators/     # Zod schemas
        ├── routes/         # Express routers
        └── seed/           # Development seed script
    └── tests/              # Jest + Supertest + mongodb-memory-server
```

## Installation

### Prerequisites

- Node.js 20+
- A MongoDB Atlas cluster (or local MongoDB for development)

### 1. Backend setup

```bash
cd server
cp .env.example .env
# Edit .env and fill in your real MongoDB Atlas password and a strong JWT_SECRET
npm install
```

### 2. Frontend setup

```bash
cd client
cp .env.example .env
npm install
```

## MongoDB Setup

1. Create a MongoDB Atlas cluster and a database user (e.g. `zorxindia_db_user`).
2. Copy the connection string into `server/.env` as `MONGODB_URI`, replacing `YOUR_PASSWORD` with the real password.
3. The database name is controlled separately via `MONGODB_DB=zorx-ms` — you do not need to put it in the URI path.
4. **Never commit `.env`.** Only `.env.example` (with placeholder values) is committed. `.env` is already in `.gitignore`.

For local development without Atlas, you can run a local `mongod` and point `MONGODB_URI` at it, e.g. `mongodb://127.0.0.1:27017`.

## Environment Variables

See `server/.env.example` and `client/.env.example` for the full list. Key backend variables:

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | MongoDB Atlas connection |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Auth token signing |
| `OFFICE_LATITUDE`, `OFFICE_LONGITUDE` | **Provisional** initial office coordinates — override anytime from Admin → Office Settings |
| `OFFICE_ATTENDANCE_RADIUS` | Allowed check-in/out radius in meters (default 200) |
| `WORKING_START_TIME`, `WORKING_END_TIME`, `BREAK_DURATION_MINUTES` | Company schedule (default 09:30–18:00, 1h break) |
| `TIMEZONE` | Used for all attendance date/time calculations (default `Asia/Kolkata`) |

These env values only seed the `OfficeSettings` document on first run — after that, the values stored in the database (editable via Admin Settings) take precedence.

## Development Commands

```bash
# Backend (from server/)
npm run dev      # start with nodemon
npm run seed     # wipe & seed development data
npm test         # run Jest test suite

# Frontend (from client/)
npm run dev      # start Vite dev server (http://localhost:5173)
npm run build    # production build
npm run lint     # ESLint
```

The Vite dev server proxies `/api` to `http://localhost:5001` (see `client/vite.config.js`), so you can run both servers side by side without CORS issues in development.

## Seeding Development Data

```bash
cd server
npm run seed
```

This creates departments, sample attendance/tasks/leave/announcements, and the following accounts (**all with password `Zorx@Dev123`** — development only, never used in production):

| Email | Role |
|---|---|
| superadmin@zorxindia.dev | SUPER_ADMIN |
| admin@zorxindia.dev | ADMIN |
| hr@zorxindia.dev | HR |
| manager@zorxindia.dev | MANAGER |
| employee1@zorxindia.dev … employee5@zorxindia.dev | EMPLOYEE |

## Testing

```bash
cd server
npm test
```

Tests use `mongodb-memory-server` (no real database needed) and cover:
- Haversine distance calculation and coordinate validation
- Check-in/check-out inside vs. outside the attendance radius
- Duplicate check-in/out, check-out without check-in
- Working-minutes/overtime/late calculations
- Leave balance deduction, restoration, and overdraw prevention
- Role-based access control across protected endpoints (login, employee list, leave approval, office settings)

## Build

```bash
cd client && npm run build   # outputs client/dist
```

The backend runs directly with `node src/server.js` (or `npm start`) — no build step required.

## Deployment Notes

- Set `NODE_ENV=production` and a strong, unique `JWT_SECRET` in production.
- Point `CLIENT_ORIGIN` at your deployed frontend origin (used for CORS).
- Serve the built `client/dist` from your static host/CDN of choice, or behind the same reverse proxy as the API.
- Office location, working hours, and attendance radius can all be changed after deployment from **Admin → Office Settings** without a redeploy.

## Attendance Configuration

- **Office location**: `OFFICE_LATITUDE` / `OFFICE_LONGITUDE` seed the initial `OfficeSettings` document. These are **provisional** — update the real coordinates from Admin → Office Settings before going live. The UI shows the detected coordinates for review before saving; it never saves silently.
- **Attendance radius**: `OFFICE_ATTENDANCE_RADIUS` (meters). Employees can only check in/out when within this distance of the office, verified server-side via the Haversine formula on every request.
- **Working hours**: `WORKING_START_TIME` / `WORKING_END_TIME` / `BREAK_DURATION_MINUTES` drive late-arrival, half-day, and overtime calculations.
- Location is only requested at the moment of check-in/check-out — there is no background or continuous location tracking.

## Security Notes

- Passwords are hashed with bcrypt (12 rounds); plaintext passwords are never stored or logged.
- All authorization checks are enforced server-side via middleware (`requireAuth`, `requireRole`) — frontend route guards are a UX layer only.
- MongoDB queries are sanitized against operator injection (`express-mongo-sanitize`).
- Security headers via Helmet; login and general API traffic are rate-limited.
- `.env` files are git-ignored; only `.env.example` placeholders are committed. Rotate `JWT_SECRET` and the MongoDB password if either is ever exposed.
