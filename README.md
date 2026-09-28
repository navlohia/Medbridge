# MedBridge — Connected Clinical Records & Patient Intelligence

A local-first EMR demo: React 19 + Vite + Tailwind frontend, Node/Express + SQLite (`node:sqlite`) backend, Gemini-powered medicine explanations and lab-report reading. Built for hackathon judging — three role-based portals, time-slot appointment booking, and an AI-assisted lab-report upload flow.

## Quick Start

```bash
npm run install:all   # root + backend + frontend
npm run seed          # seeds SQLite (backend must NOT be running)
npm run dev           # backend :5000 + frontend :5173
```

Open `http://localhost:5173`.

## Demo Accounts (shared password: `demo1234`)

| Role | Email | Who |
| --- | --- | --- |
| **Admin** | `admin@medbridge.com` | Priya Nair — account management portal |
| **Doctor** | `doctor@medbridge.com` | Dr. Evelyn Reed, MD — Internal Medicine & Cardiovascular Care |
| **Doctor** | `dr.okafor@medbridge.com` | Dr. Samuel Okafor — Pulmonology & Sleep Medicine |
| **Doctor** | `dr.haddad@medbridge.com` | Dr. Leila Haddad — Endocrinology & Diabetes Care |
| **Patient** | `patient1@medbridge.com` | Marcus Vance — diabetes/hypertension story |
| **Patient** | `patient2@medbridge.com` | Elena Rostova — asthma/GERD story |

There is **no public self-registration** — every new account is created by an authenticated admin or doctor inside the app, which generates a one-time temporary password.

## The Three Portals

**`/admin` — Admin Console (Priya).** Overview stats (doctors, patients, today's appointments, pending requests, lab reports to review, inactive accounts), Doctors and Patients tables with search + create + activate/deactivate, and a global read-only appointments view. Admins manage *accounts only* — clinical records are append-only and never editable or deletable by anyone.

**`/doctor` — Clinician Workspace (Dr. Reed).** Patient switcher with quick-add ("Add Patient" registers a walk-in in ~30 seconds), appointment requests inbox with Confirm / **Propose Reschedule** / Decline, a Day View of booked slots, RxPad visit logger with live drug-conflict warnings, and a symptom journal with guidance threads.

**`/patient` — Patient Home (Marcus / Elena).** Symptom journal with severity spine and doctor replies, vitals trends with normal-range bands, medicines with plain-language explanations, **lab-report photo upload with AI-assisted reading**, and time-slot appointment booking.

## Key Flows to Demo

1. **Time-slot booking** — Patient → Appointments → Book: pick doctor → date → live slot grid. Already-booked times are visibly struck through and disabled. If someone grabs your slot first, you get a friendly "just booked — pick another" message and a refreshed grid (race-safe: the server re-validates and 409s).
2. **Reschedule** — Doctor opens Propose Reschedule from a request (or a confirmed visit), picks a new slot from the *same* grid, adds a note. The patient sees original vs. proposed side by side and Accepts (moves) or Declines (releases both slots).
3. **Lab report upload** — Patient → Overview → "Upload report photo" → review the extracted values (or type them manually) → confirm. Confirmed values flow into Trends and auto-complete matching pending lab orders (±14 days) exactly like a manual entry. **Nothing saves until the patient confirms.**
4. **Admin lifecycle** — Create a doctor or patient → the temp password is shown once with copy-to-clipboard → the account is immediately usable everywhere. Deactivating blocks login only; history is untouched.

## Configuration

`backend/.env`:

```
GEMINI_API_KEY=your_key_here   # optional — see below
PORT=5000
JWT_SECRET=any-long-random-string
```

**Gemini:** with a key set, medicine explanations are AI-generated at seed time and lab-report photos are read by Gemini vision. **Without a key, everything still works** — curated fallback explanations are used, and lab uploads land on the manual-entry review screen (never a dead end). The app probes current Gemini model names at runtime, so no code change is needed when models rotate.

## Architecture Notes

- **Routes** are dual-mounted: `/api/*` and bare `/*` behave identically.
- **Schema migrations** are guarded (column-existence checks / table-rebuild recipe) and idempotent — `runMigrations()` runs on every boot.
- **Append-only clinical records**: visits, prescriptions, lab orders, and confirmed journal entries are immutable; `appointments` is the one mutable workflow table; `lab_report_uploads` are discardable only while `pending_review`.
- **Availability math** lives in one place (`backend/src/utils/scheduling.js`), with a shared `SLOT_DURATION_MINUTES = 30` constant; occupied = any non-cancelled appointment at that exact slot *plus* any open reschedule proposal's offered slot.
- **Design tokens**: `frontend/DESIGN_TOKENS.md` is the single source of truth — no raw palette classes in components.

## Project Layout

```
backend/src/         Express app, routes/, middleware/, db/ (schema+seed+geminiHelper), utils/, config.js
frontend/src/        pages/ (3 dashboards + login), components/{common,doctor,patient,appointments}, api/, context/, router.jsx
scripts/             e2e-drive.js (Playwright E2E, stages A–M), test suites, overflow checks, screenshots
backend/uploads/     gitignored lab-report images (paths stored in DB)
```

## Testing

```bash
cd backend && node src/test-api.js            # 12 endpoint checks
node scripts/test-round2-accounts.js          # admin + quick-add (34)
node scripts/test-round2-scheduling.js        # slots + reschedule (30)
node scripts/test-round2-labreports.js        # lab reports (20)
node scripts/e2e-drive.js                     # full browser E2E (35 checks)
node scripts/overflow-round2.js               # responsive sweep (needs dev server up)
```

Backend suites assume a fresh seed: stop the backend, `npm run seed`, restart, then run.

## Known Gaps (deliberate)

- PDF lab reports are out of scope — photos (JPG/PNG) only.
- Gemini key is optional; without it the lab-report AI reading is replaced by the manual-entry path.
