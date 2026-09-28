# What Changed Since Last Round — Judge Demo One-Pager

Every flagged problem, its fix, and exactly where to click to show it live.
All accounts share the password `demo1234`.

---

## 1. "No admin portal" → **Admin Console at `/admin`**

- **Where to click:** Login → **Admin** persona tile → Sign In.
- **Show:** Overview stat cards (doctors, patients, today's appointments, pending requests, lab reports to review, inactive accounts) → **Doctors** and **Patients** tabs (search, create, activate/deactivate with an explicit "history untouched" dialog) → **Appointments** tab (global, read-only, filterable).
- **Say:** "Admins manage accounts only — clinical records stay append-only for everyone, including admins."

## 2. "Couldn't add a new patient" → **Two entry points, one shared engine**

- **Admin path:** Admin → Patients → **Add Patient** → fill name/email/DOB → temp password shown **once** with copy button.
- **Doctor path (fast walk-in):** Doctor dashboard → **Add Patient** chip next to the Active Patient selector → name/email/DOB → **Start Visit** → the new patient is auto-selected and a visit can be logged immediately, no reload.
- **Say:** "Both paths call the same backend validation and password generator — the account is real and immediately usable everywhere."

## 3. "Booking only picks a date" → **Doctor → Date → Time slot grid**

- **Where to click:** Patient → Appointments → **Book Appointment** → pick a doctor → pick a date → a live grid of 30-minute slots appears (morning/afternoon groups).
- **Say:** "Availability is computed server-side from the doctor's working hours — Sundays show no slots, past times today are disabled, and every slot is re-validated at submit."

## 4. "Doctor can't offer a reschedule" → **Propose / Accept / Decline**

- **Where to click:** Doctor → Appointment Requests → **Propose Reschedule** → pick a new slot from the same grid → add a note → send. Then, as Patient 2 (Elena has a seeded request): Appointments tab → card shows original time struck through, proposed time highlighted, doctor's note → **Accept** (or **Decline**).
- **Say:** "The original slot stays held while the offer is open — no double-booking window — and accepting moves the appointment atomically."

## 5. "Booked slots don't show unavailable" → **Live grid + race-safe 409**

- **Where to click:** Book any slot as Marcus. Reopen the booking modal for the same doctor/date — the taken slot is now **greyed out, struck through, and labelled "Booked"** for every other patient.
- **Say:** "Under the hood, two patients racing for the same slot is decided server-side: exactly one 201, the other gets a friendly 409 — 'That time was just booked' — and the grid refreshes in place."

## 6. "No lab report upload" → **Photo → AI-assisted reading → human confirms**

- **Where to click:** Patient → Overview → **Upload report photo** (top of the pending-labs card) → drop a JPG/PNG → preview → "Read my report" → review screen: editable rows, include/exclude checkboxes, low-confidence hints, "add a row the scan missed" → **Save to my record**.
- **Show the payoff:** the confirmed value appears on **Trends** and the matching pending lab order is marked complete automatically (±14-day window) — the same pipeline as manual logging, no parallel data path.
- **Say:** "Nothing saves until the patient confirms — the system suggests, the human decides. If the photo is unreadable, the same screen opens empty for manual entry: never a dead end." (PDF is a documented out-of-scope gap.)

---

## Plus: the declutter pass

Routing overhaul (`/doctor`, `/patient`, `/admin` with guards and deep links), a calmer admin workspace, three-tier action hierarchy in the requests inbox, the duplicated "Symptom signals" panel replaced by a one-line nudge, one shared appointment-card grammar across all four surfaces, and a token-purity sweep (zero raw palette classes). `DESIGN_TOKENS.md` unchanged.

## Demo-proof numbers

- Backend suites: **96/96** · Browser E2E (incl. all six fixes): **35/35** · UI smoke suites: **41** · Responsive sweep: **27/27 clean** · Fail-state sweep: **6/6**
- Fresh install: `npm run install:all && npm run seed && npm run dev` → `http://localhost:5173`
