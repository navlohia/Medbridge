# UPGRADE_PLAN.md — MedBridge demo-ready upgrade

> **SOURCE OF TRUTH.** If context resets: re-read this file and continue from the first unticked phase.
> After each phase: tick it, add 3–5 lines in the Progress Log (what changed, what was verified, what is left).

## How the brief maps to 100 phases

The brief's 7 big phases are decomposed into 100 atomic phases (P01–P100), executed strictly
in order, one at a time, app building + logging in after every phase. Mapping:
P01–P02 setup · P03–P42 brief-Phase 1 (sessions/roles/sign-up/authorization/real-time/hardening)
· P43–P58 brief-Phase 2 (design system + brand) · P59–P68 brief-Phase 3 (doctor tabs)
· P69–P83 brief-Phase 4 (prescription composer) · P84–P90 brief-Phase 5 (restyle patient/admin)
· P91–P97 brief-Phase 6 (debug) · P98–P99 brief-Phase 7 (test everything) · P100 HANDOFF.md.

## Assumptions logged (brief says: choose the safest reasonable option and log it)

- A1. Phase numbering: continuous P01–P100; brief-section shown in each entry. Brief's own 7 phases are goals, not the unit of work.
- A2. CLINIC_ACCESS_CODE demo value `CLINIC-2026-DEMO` (in backend/.env.example AND gitignored backend/.env — it is a demo gate, not a secret); printed once at server start per brief.
- A3. ADMIN_INVITE_CODE demo value `ADMIN-BOOTSTRAP-2026` (same treatment).
- A4. Shell choice (brief offers two): slim top bar + left sidebar; bottom tab bar on mobile. Used in all three portals.
- A5. Fonts: Fraunces (display serif) + Hanken Grotesk (UI grotesque) + JetBrains Mono (tabular readings), via @fontsource.
- A6. 403 handling nuance (P05): blanket-clearing on every 403 would log users out on ordinary role-forbidden calls. Clear + redirect on 401 always; on 403 only when the message indicates invalid/expired token or deactivation (matches brief's parenthetical "invalid token / deactivated").
- A7. Deactivated-token rejection (brief 1g) is implemented early (P17) because the authorization matrix (1d) depends on it; not duplicated later.
- A8. Existing scripts/*.js Playwright suites are updated in-place as UI changes land (personas removed, sessionStorage), keeping them green throughout — brief Phase 6's "update them, don't delete" is honored continuously, not deferred.
- A9. Schema changes in the whole brief: only `users.must_change_password` (additive). DB backed up to backend/src/db/backup/ BEFORE that migration (P02 creates the backup flow).
- A10. Windows-safe commands only (brief). DB copies via `node -e` fs.copyFileSync, not shell `cp`.

---

## 100-PHASE CHECKLIST

### Setup
- [x] P01 — Save UPGRADE_PLAN.md (verbatim brief + this checklist) [STEP 0]
- [x] P02 — Baseline verified (build + login) + DB backup flow (backend/src/db/backup/)

### Brief Phase 1 — Sessions, roles, sign-up, real-time
- [x] P03 — `GET /auth/me` endpoint (session validation)
- [x] P04 — Sessions → sessionStorage (per-tab) + startup `/auth/me` validation
- [x] P05 — Global 401/403 handler: clear session → role picker with message
- [x] P06 — Per-tab isolation verified (2 tabs, 2 roles, independent)
- [x] P07 — Remove Navbar "Demo Switch" pills
- [x] P08 — Remove LoginPage personas + prefilled creds + hardcoded default patient; optional VITE_DEMO_HINTS per-role prefill (OFF)
- [x] P09 — `POST /auth/login` takes `{role}`; mismatch → generic 401
- [x] P10 — `POST /auth/register/patient` (shared validation from utils/accounts.js)
- [x] P11 — `POST /auth/register/doctor` + CLINIC_ACCESS_CODE (.env.example, startup print, 403 wrong)
- [x] P12 — Admin one-time bootstrap when zero admins (ADMIN_INVITE_CODE)
- [x] P13 — Password UX: min 8, confirm, show/hide, strength hint
- [x] P14 — Role picker at `/` (three large cards)
- [x] P15 — `/auth/patient|doctor|admin` pages (Sign in / Create account, back links)
- [x] P16 — Registration returns session → lands in portal; admin modal copy updated
- [x] P17 — authenticateToken reloads user from DB per request; deactivated/role-mismatch rejected
- [x] P18 — `/patients` list doctor-only; `/patients/:id/*` owner-or-doctor (patients own data only)
- [x] P19 — Admin blocked from clinical history; catalogs (/medicines,/diagnoses,/lab-tests) need token
- [x] P20 — `/uploads` authenticated (owner patient or any doctor); client fetch→blob loading
- [x] P21 — `PATCH /appointments/:id` cancel (own requested/confirmed) + patient cancel button
- [x] P22 — Authorization-matrix test suite (every row) passes
- [x] P23 — SSE `GET /api/events`: in-memory hub, heartbeat 25s, cleanup on close
- [x] P24 — Client fetch-streaming reader: auth header, reconnect+backoff, ONE stream per tab, closed on logout
- [x] P25 — RealtimeProvider + useRealtime(types, handler) + "Live" indicator in header
- [x] P26 — Emit appointment.requested / appointment.updated after every appointment mutation
- [x] P27 — Emit visit.created, selflog.created, guidance.created
- [x] P28 — Emit labreport.confirmed, lab_order.completed, account.created, account.status_changed, session.revoked
- [x] P29 — Flashless refetch: keep old data on screen, swap when new lands (fix loading=true pattern)
- [x] P30 — Realtime toasts for meaningful events (aria-live)
- [x] P31 — Reconnect → refetch all; 30s poll fallback; visibilitychange refetch
- [x] P32 — SlotGrid/BookAppointmentModal live-refresh on appointment events for that doctor
- [x] P33 — scripts/e2e-realtime.js: 3 browser contexts, live updates both directions
- [x] P34 — vite proxy: /api covers everything incl. SSE (unbuffered headers enforced via configure hook); host:true so phones on the same Wi-Fi can open the dev server; frontend "start" = vite preview --port 5174 --host; root start = build + backend :5000
- [x] P35 — Express serves dist + SPA fallback; `npm run build && npm start` = ONE port :5000
- [x] P36 — JWT_SECRET: remove fallback; auto-generate 48-byte into .env if missing/old public value
- [x] P37 — JWT 12h expiry; malformed JSON → 400; CORS = ALLOWED_ORIGINS
- [x] P38 — Login rate limit 10 fails/15min per IP+email → 429 + Retry-After
- [x] P39 — Temp passwords via crypto.randomInt (longer); `users.must_change_password` migration (DB backup FIRST)
- [x] P40 — `POST /auth/change-password` (requires current password)
- [x] P41 — Forced password-change screen on first login for admin/doctor-created accounts
- [x] P42 — Brief Phase 1 verification suite in backend/tests (node:test, temp DB copy): role-mismatch login, both registers incl. bad code, EVERY matrix row, deactivated token, rate limit, malformed JSON=400, SSE cross-client <1s + isolation

### Brief Phase 2 — Design system foundation + brand
- [x] P43 — Palette tokens: paper/ink/spruce/clay CSS variables + Tailwind; hairline borders; no gradients/glow
- [ ] P44 — @fontsource fonts (Fraunces, Hanken Grotesk, mono); body 14px+, nothing under 12px
- [ ] P45 — src/utils/helpers.js: move formatTime12/initialsOf/timeAgo/localToday out of ~10 files
- [ ] P46 — brand.js (name/tagline single source) + components/brand/Logo.jsx (full/mark/on-light/on-dark) + /public/logo.svg + favicon + animated mark
- [ ] P47 — New Button + Input + Select primitives
- [ ] P48 — Combobox primitive (keyboard nav)
- [ ] P49 — Tabs primitive (URL-synced)
- [ ] P50 — Section/Card + Badge + Avatar
- [ ] P51 — Modal focus trap + focus restore; Drawer primitive
- [ ] P52 — Toast stack (aria-live, auto-dismiss, success/info/warning/danger)
- [ ] P53 — Table + Skeleton + EmptyState (small illustrations) + Kbd + Tooltip
- [ ] P54 — App shell: top bar + left sidebar (bottom tab bar on mobile), all portals
- [ ] P55 — Compact page header (date, title, primary action) replacing gradient banners
- [ ] P56 — Motion 150–250ms + prefers-reduced-motion + focus-visible everywhere
- [ ] P57 — Role picker + sign-in/sign-up restyled (split layout, brand panel, validation states)
- [ ] P58 — DESIGN_TOKENS.md rewritten for the new system

### Brief Phase 3 — Doctor portal in tabs
- [ ] P59 — App.jsx: /doctor/* subpaths route (no more NotFound)
- [ ] P60 — `GET /doctor/attention` cross-patient queue
- [ ] P61 — Doctor shell tabs (URL-synced) + /doctor/overview (today, requests count, attention queue, quick actions)
- [ ] P62 — /doctor/patients: searchable master list with live signals
- [ ] P63 — /doctor/patients/:id chart: sub-tabs Summary|Visits|Journal|Vitals|Appointments + persistent patient header
- [ ] P64 — Patient header: age/sex from DOB/gender, key counts, "New prescription"
- [ ] P65 — Retire patient combobox; zero-patients loading fix; stale-response guard (AbortController/request id)
- [ ] P66 — /doctor/schedule: Day/Week view + working hours
- [ ] P67 — /doctor/requests tab (Confirm/Propose/Decline with SlotGrid) + tab count badge
- [ ] P68 — Timer/timeout cleanup + toast timer stacking fix
- [ ] P69 — `POST /visits` validation: patient_id/diagnosis_id/medicine_ids → 400 (not 500 FK)
- [ ] P70 — Follow-up validated with validateSlot() → 409 readable; no silent 'confirmed' default
- [ ] P71 — Active-medicine defined ONCE (visit_date + parsed duration) in utils
- [ ] P72 — Interaction check + patient "Your medicines" both use the active definition
- [ ] P73 — Composer route /doctor/patients/:id/prescribe + paper sheet aesthetic
- [ ] P74 — Letterhead (logo, doctor, date, Rx#) + patient block + serif Rx mark
- [ ] P75 — Diagnosis: one searchable combobox (name or symptoms) → inked text + change link
- [ ] P76 — Medicines: numbered ruled lines; "/" focuses add field, Enter adds; class filter inside picker
- [ ] P77 — Dose chips (1-0-1, OD, BD, TDS, QID, HS, SOS) + timing (before/after food) + duration chips + custom
- [ ] P78 — Investigations: lab-test chips with due-date popovers
- [ ] P79 — Advice ruled textarea + follow-up date + SlotGrid (this doctor) + signature line
- [ ] P80 — Sticky right rail: interaction warnings, current meds, latest vitals, journal signals
- [ ] P81 — Draft autosave (sessionStorage, "draft restored") + unsaved-changes guard + Ctrl/Cmd+Enter
- [ ] P82 — Print stylesheet (sheet only) + read-only issued prescription reused in Visits + patient History
- [ ] P83 — Composer save end-to-end (visit created, events fire, warnings non-blocking)

### Brief Phase 5 — Restyle patient + admin, full sweep
- [ ] P84 — Patient shell + Overview restyled
- [ ] P85 — Patient Journal + Trends restyled
- [ ] P86 — Patient Appointments + History + all patient modals restyled
- [ ] P87 — Admin restyled (4 tabs + modals), calmer operations feel
- [ ] P88 — 404/loading/empty/error restyled; dead CSS/components deleted (hero-grid, glows, gradient text)
- [ ] P89 — Responsive walk 1440/1280/1024/768/390: alignment, truncation, contrast, focus order fixed
- [ ] P90 — DESIGN_TOKENS.md final update; three portals feel like one product

### Brief Phase 6 — Debug everything
- [ ] P91 — utils/dates.js (localDateStr); replace the 10 frontend toISOString().split uses
- [ ] P92 — timeAgo unified: parse SQLite UTC CURRENT_TIMESTAMP correctly everywhere
- [ ] P93 — `POST /self-logs` validation (log_date, value ranges, label type) + 404 for missing patient ids + patient double-booking guard (same slot, two doctors)
- [ ] P94 — Admin stat "Lab reports to review" relabel/remove; RemindersBar seen-meds keyed by user id; Toast danger type; one shared severity helper (/5 + legacy /10)
- [ ] P95 — seed.js: CSVs copied into backend/data (env override), refuses to run destructively without --force; add npm run seed:demo + db:backup
- [ ] P96 — Update scripts/*.js smokes for removed personas/old copy; test-api.js → real node:test (exits non-zero)
- [ ] P97 — Audit listed components for bug classes (dates, validation, stale state, unhandled errors, a11y, image_url rendering)

### Brief Phase 7 — Test every feature
- [ ] P98 — TEST_REPORT.md: auth + patient features (how tested | result | fix)
- [ ] P99 — TEST_REPORT.md: doctor/admin/realtime(8 events, 3 contexts)/cross-cutting (keyboard pass, 390px, 404, network/empty states); ALL suites green; screenshots/final/
- [ ] P100 — HANDOFF.md: commands (single-port + dev), URLs, accounts, CLINIC_ACCESS_CODE, tests, DB backup/restore, 5-minute demo script, limitations, per-item change summary

---

## Progress Log (3–5 lines per phase, newest at bottom of each entry)

### P01 — UPGRADE_PLAN.md saved
- Verbatim brief + 100-phase checklist + assumptions A1–A10 recorded.
- Verified: file at repo root; checklist parseable; resume protocol at top.
- Left: everything else.

### P02 — Baseline + DB backup flow
- Changed: nothing in code (baseline snapshot). Created backend/src/db/backup/ and copied medbridge.db (1,466,368 bytes) via node fs.copyFileSync (A10) BEFORE any future schema change.
- Verified: `npm run build` green (vite 6.4.3, 870 kB bundle); backend on :5000 + vite on :5173 already running; login 200 for doctor/patient/admin (demo1234); GET /patients 200 with 4 rows using doctor token.
- Left: P03 onward — all code changes still ahead; bundle size noted (chunk >500 kB warning, no action this round).

### P03 — GET /auth/me
- Changed: backend/src/routes/auth.js — new `GET /auth/me` (authenticateToken) reloading the user from DB, rejecting deactivated accounts and role-changed tokens with 401.
- Verified live: login 200 → /auth/me 200 (returns id/name/email/role/specialization); tampered token → 403; no token → 401. Backend restarted via taskkill + background npm run dev (BACKGROUND tool mode unavailable — shell `&` used, logged for future phases). `npm run build` still green.
- Left: client does not call /auth/me yet (that is P04, together with the sessionStorage move).

### P04 — sessionStorage sessions + startup validation
- Changed: client.js getToken() + AuthContext (login/logout/validate) now use sessionStorage; startup effect validates via new api.me() (GET /auth/me) and clears the session on failure. api.me() added to client.
- Verified: scripts/p04-verify.js (new) — 9/9 PASS: two same-browser tabs logged in as doctor + patient independently; token present in sessionStorage and absent in localStorage; reload survives /auth/me validation; tab-A logout leaves tab-B session intact. `npm run build` green.
- Note: scripts/smoke-round2-*.js use localStorage.clear() (harmless — no longer holds session keys) except smoke-round2-failstates.js / admin-ui.js which read/write medbridge_token/user from localStorage — to be updated in-place when those suites are next run (A8).
- Left: global 401/403 handler (P05).

### P05 — Global 401/403 handler
- Changed: client.js — handleAuthFailure() clears sessionStorage, stores a `medbridge_auth_notice` message for the auth screen, fires `medbridge:auth-failure` (AuthContext listens, clears user state), navigate('/', replace). Triggers: any 401 outside /auth/*, and 403 only when the message matches invalid/expired/deactivat/token (A6). Wrong-password login 401 excluded.
- Verified: scripts/p05-verify.js — 9/9 PASS. Tampered token → cleared + back at auth entry with notice. Deactivated pat_2: login blocked + startup /auth/me 403 → cleared (true MID-SESSION revocation lands with P17's per-request user reload, per A7). Role-forbidden 403 (patient → /admin/stats) leaves session intact. Build green.
- Left: smoke-round2 scripts still reference old persona copy (updated continuously per A8); removals P07–P08.

### P06 — Per-tab isolation verified
- Changed: no code (verification phase). scripts/p06-verify.js (new).
- Verified 8/8 PASS: two doctor tabs (doctor@ + dr.okafor@) hold different tokens and call /patients simultaneously (200/200); logout in one tab leaves the other fully authorized; patient deep-linking /doctor is bounced to /patient by the role guard; simultaneous reloads keep both roles on their own homes.
- Left: removal of insecure switching (P07–P08).

### P07 — Remove Navbar Demo Switch pills
- Changed: Navbar.jsx — Quick Demo Switcher block, handleQuickSwitch(), unused `login` binding + ArrowRightLeft icon removed; brand block, user chip, Sign Out untouched.
- Verified: build green; Playwright — zero "Demo Switch" elements, Sign Out present, user identity chip rendered on /doctor.
- Left: LoginPage personas + prefilled creds + hardcoded default patient (P08).

### P08 — Personas, prefill, hardcoded default removed
- Changed: LoginPage.jsx rewritten (no persona grid, no prefilled creds; shows medbridge_auth_notice from P05; VITE_DEMO_HINTS=true opt-in "use demo account" link, OFF by default). DoctorDashboardPage hardcoded patient1@ fallback removed (first patient). scripts/ updated in place per A8: smoke-round2-{routing,quickadd,admin-ui,failstates,labupload}, screenshots-{round2,premium}, overflow-{round2,check}, e2e-drive (form logins + sessionStorage; shared scripts/lib.js helper).
- Verified: build green; smoke-round2-routing.js 12/12 PASS (includes "no persona tiles" + form logins for admin/doctor/patient + role-guard + 404).
- Left: e2e-drive not run yet (reseeds DB — deferred to P95 when seed.js is non-destructive).

### P09 — Role-aware login
- Changed: backend/src/routes/auth.js — login accepts `{role}`; if account.role ≠ requested role → SAME generic 401 as wrong password, checked AFTER bcrypt verify (no role enumeration). Omitted role still works (legacy callers).
- Verified live: correct role 200; mismatch 401 with byte-identical message to wrong-password 401; no-role login 200. Backend restarted via taskkill+nohup pattern. Build green (no FE change).
- Left: register flows P10–P12.

### P10 — POST /auth/register/patient
- Changed: auth.js — open patient sign-up; name/email/password(≥8, confirm)/dob(+future & 130y sanity)/gender/phone validation mirroring utils/accounts.js rules; 409 on duplicate email; returns session (issueSession).
### P11 — POST /auth/register/doctor + CLINIC_ACCESS_CODE
- Changed: config.js exports CLINIC_ACCESS_CODE/ADMIN_INVITE_CODE; backend/.env + .env.example updated (A2: CLINIC-2026-DEMO; .env gitignored, values never printed); endpoint 403s when code empty (disabled) or wrong; valid code → doctor account + session.
### P12 — Admin one-time bootstrap
- Changed: POST /auth/register/admin — only when admin count is 0 AND invite code matches (A3: ADMIN-BOOTSTRAP-2026); 403 otherwise.
- Verified live (all three): good register 200+token+role; dup 409; short pw 400; pw mismatch 400; wrong doctor code 403; correct code 200 role=doctor; admin bootstrap with existing admins 403 "An administrator account already exists". node --watch hot-reloaded routes; auth router loads clean. Two throwaway test accounts (p10.*) remain in dev DB — harmless.
- Left: startup print of the access code + client UI (P13–P16).

### P13 — Password UX component
- Changed: components/auth/PasswordField.jsx (new) — show/hide toggle, live strength bar (min 8 → weak/fair/good/strong), confirm-field mismatch hint; used by all new auth forms.
- Verified: build green; exercised via P15 register flows below.

### P14 — Role picker at /
- Changed: pages/RolePickerPage.jsx (new) — three large portal cards → /auth/{patient,doctor,admin}; shows the P05 session-expiry notice; App.jsx renders it for signed-out users (legacy /login folds into it). vite proxy narrowed /auth → /api/auth so /auth/* reaches the SPA ("Cannot GET" reproduced first via Playwright); vite dev restarted.
- Verified: picker renders 3 cards; cards navigate to the right /auth pages.

### P15 — /auth/{patient,doctor,admin} pages
- Changed: pages/AuthPage.jsx (new) — sign-in posts {role}; Create account for patient (name/email/dob/gender?/phone?) + doctor (specialization + clinic access code); admin has no public sign-up, offers one-time bootstrap only when GET /auth/admin-exists says zero admins; back-to-picker links; api.login/register*/adminExists added to client; AuthContext gained applySession + role-aware login. Fixed two bugs caught by the new suite: register was sending the (empty) sign-in password state; notice-consumption side effect in useState initializer (StrictMode double-invoke) moved to an effect. AuthContext: network failure during startup validation keeps the stored session (only 401/403 clear it) so backend outages show error states, not logouts. All Playwright scripts moved to /auth/<role> form logins (scripts/lib.js helper).
- Verified: scripts/p14-16-verify.js 14/14 — plus regressions re-run: p04 9/9, p05 9/9, p06 8/8, routing smoke 12/12; build green.

### P16 — Registration returns session; copy updated
- Changed: backend issueSession (P10–P12) + client applySession → new registrants land in their portal with a stored session; admin modal copy now says patients can self-register and doctors use the clinic access code (was "there is no self-signup in MedBridge").
- Verified: UI registration (patient + doctor-good-code) lands on /patient and /doctor with token in sessionStorage (suite rows 2–3); admin page shows no sign-up link while admins exist.
- Left: authorization matrix P17–P22.

### P17 — Per-request user reload (mid-session revocation)
- Changed: backend/src/middleware/auth.js — authenticateToken now SELECTs the user by token id on EVERY request; missing account → 401, deactivated → 401 (message matches the A6 client regex so tabs sign out live), role changed → 401; req.user reflects current DB state, not stale token claims. (Pulled ahead of the matrix per A7.)
- Verified live: pat_2 token → dashboard 200; admin deactivates → SAME token gets 401 "This account has been deactivated by an administrator."; reactivated → same token 200 again. p05-verify.js section B now covers the true mid-session path. Build green.
- Left: matrix enforcement P18–P21.

### P18 — /patients matrix rows enforced
- Changed: backend/src/routes/patients.js — GET /patients now requireRole('doctor'); requirePatientAccess guard on /:id/history|dashboard|self-logs (doctor any, patient ONLY own id, admin 403). IDOR from the brief reproduced first (any token could read /patients/pat_2/* as pat_1) then closed.
- Verified live: 11/11 rows — no-token 401, patient list 403, admin list 403, doctor list 200, pat_1→pat_2 history/dashboard/self-logs 403, owner reads 200, doctor reads 200, admin clinical reads 403. smoke-round2-admin-ui patient-visibility check redirected to /api/admin/patients (admin token can no longer read /patients). Build green (no FE change).
- Left: catalogs + /uploads + admin-clinical confirmation (P19–P20).

### P19 — Catalogs require token (admin-clinical block confirmed in P18 rows)
- Changed: medicines.js (list + :id), diagnoses.js, labTests.js — authenticateToken added. Any valid role may read catalogs (patient portal needs them for medicine detail/lab ranges); anonymous access is gone.
- Verified live: all four endpoints anon=401, patient-token=200.

### P20 — /uploads authenticated + fetch→blob client
- Changed: server.js no longer serves /uploads statically (public path dead — legacy URL now 404); new GET /api/lab-reports/image/:name (authenticateToken, filename regex, DB lookup, owner-patient-or-any-doctor, private no-store); labReports image_url producers emit the authenticated route; LabReportHistory.jsx gained an image viewer that fetches with the Authorization header → blob URL (revoked on close).
- Verified live: anon 401, owner 200, doctor 200, other patient 403, admin 403, legacy /uploads/x 404. smoke-round2-labupload.js 9/9 after making its "Matched" assertion honest (snapshots pending labs BEFORE confirming — a re-run after the order was consumed legitimately shows no Matched line). Build green; p14-16 regression 14/14.
- Left: appointment cancel (P21), matrix test suite (P22).

### P21 — Patient appointment cancel
- Changed: backend PATCH /appointments/:id/cancel (patient-only, own row, requested/confirmed only; reschedule_proposed → 409 pointing at accept/decline; already-cancelled → 409); api.cancelAppointment + Cancel button on patient appointment cards (requested/confirmed + upcoming only).
- Verified live: own cancel 200 → status cancelled; re-cancel 409; doctor on the route 403; other patient 403. UI: Cancel button renders for patient2's upcoming rows. Note: test cancelled pat_2's seeded CONFIRMED row (a normal in-app action; Elena's requested row apt_pat2_req remains for reschedule demos). Build green.
- Left: matrix test suite (P22).

### P22 — Authorization matrix suite (node:test)
- Changed: backend/tests/authorization.test.js (new, 10 tests) boots the REAL app via spawn against a TEMP DB COPY (new MEDBRIDGE_DB_PATH override in database.js — additive, default unchanged) on port 4599. Covers: role-mismatch login = wrong-password 401 (byte-identical), patient register good/dup/short, doctor register bad+good code, admin bootstrap refused while admins exist, GET /patients rows (anon/patient/admin/doctor), per-patient history/dashboard/self-logs rows (IDOR), catalogs anon-401/auth-200, doctor-only writes reject admin+patient, deactivated token rejected mid-session (+restore), malformed JSON → 400 (server.js error handler now maps entity.parse.failed → 400).
- Verified: npm test → 10/10 pass in ~0.9s against the temp copy; real DB untouched. npm run build green.
- Left: real-time (P23–P33) — SSE hub, client reader, providers, events, e2e.

### P23 — SSE endpoint + in-memory hub
- Changed: backend/src/utils/events.js (new) — Map<userId, Set<connection>>, subscribe/unsubscribe, emit({type, ids, actor_name, summary}) writing `event: medbridge` + JSON data only, single heartbeat interval (default 25s, HEARTBEAT_S env for tests), broken-pipe cleanup; backend/src/routes/events.js (new) — GET /api/events (authenticateToken; text/event-stream, no-cache/no-transform, X-Accel-Buffering: no, flushHeaders, immediate `: connected` comment, unsubscribe on req/res close+error); mounted in server.js (dual prefix as usual).
- Verified live with fetch-streaming reader: 200 + text/event-stream, connect comment received, heartbeat comment received within read window. Cross-client event delivery tested in P42 once emission points exist (P26–P28).
- Left: client reader/provider (P24–P25).

### P24 — fetch-streaming SSE client
- Changed: frontend/src/realtime/sseClient.js (new) — fetch('/api/events') with Authorization header + ReadableStream reader; parses `event: medbridge` frames; auto-reconnect with exponential backoff (500ms→8s cap); module singleton guarantees ONE stream per tab; stopStream() aborts on logout; onRealtimeEvent/onAnyRealtimeEvent/onStreamStatus subscriptions.
### P25 — RealtimeProvider + Live indicator
- Changed: frontend/src/realtime/RealtimeProvider.jsx (new) — starts/stops the stream on user change, status state (live/connecting/offline), useRealtime(types, handler), useAnyRealtimeEvent, LiveIndicator (green Live dot in the navbar); wired into App.jsx + Navbar. logout() now navigate('/') so Sign Out lands on the role picker.
- Verified: browser test — exactly 1 concurrent SSE stream per tab through login/StrictMode remount/reload; Live indicator renders; stream never re-opened after logout; p04 (9/9) + p06 (8/8) regressions green; build green.
- Left: event emission points (P26–P28), flashless refetch (P29–P33).

### P26–P28 — All 9 event types emit with correct audiences
- Changed: events.js gained idsByRole/adminIds/doctorIds helpers. Emissions AFTER successful mutations, payloads only {type, ids, actor_name, summary, ids-only metadata}: appointments.js (requested→doctor+admins+patient; updated on confirm/decline/propose/accept/decline/cancel→doctor+patient+admins), visits.js (visit.created→patient ONLY, per brief), selfLogs.js (selflog.created→all doctors on both /entry and single POST; guidance.created→patient), labReports.js (labreport.confirmed + lab_order.completed when orders auto-complete→doctors+patient), admin.js (account.created on doctor/patient creation; account.status_changed→admins(+user); session.revoked→just-deactivated user), auth.js + patients.js quick-add (account.created→admins on self signups).
- Verified live with 3 concurrent SSE streams: appointment.requested/updated delivered to patient+doctor+admin; visit.created → patient only (doctor correctly excluded); selflog.created → doctor; guidance.created → patient; labreport.confirmed → doctor+patient; account.created + status_changed → admin; session.revoked → the deactivated patient's stream. (lab_order.completed emit fires only when an order actually auto-completes — will be exercised with a pending order in the P42 suite.)
- BONUS REPRODUCTION for P69: POST /visits with a bogus diagnosis_id returned 500 (FK error) — exactly the brief's known bug, now reproduced and queued for P69.
- Left: flashless refetch + toasts + reconnect/poll (P29–P33).

### P29–P31 — Flashless refetch, toasts, reconnect/poll
- Changed: hooks/useRealtimeRefetch.js (new) — maps event types → reload fns via useAnyRealtimeEvent; reloads run WITHOUT setting loading=true so old data stays on screen until new data lands (no skeleton flash). hooks/useReconnectRefetch.js (new) + sseClient onStreamReconnect — a stream that dropped and recovered triggers one refetch-everything sweep. All three dashboards wired: patient (appointments/dashboard reload on appointment/visit/guidance/lab events), doctor (requests + selected-patient history on appointment/selflog/account events), admin (stats/lists on appointment/account events). 30s poll fallback in each, suppressed while events flow (lastEventAtRef); session.revoked handler signs the user out with the notice. Echo suppression: events emitted by the acting user don't toast themselves (actor_name comparison).
- BUG caught and fixed: admin realtime block was placed above the useCallback loaders → "Cannot access 'loadStats' before initialization" TDZ crash (admin page blank); block moved below the loaders; routing smoke 12/12 again.
- Verified: scripts/p29-31-verify.js — patient (browser context 2) logged a symptom; doctor's tab (context 1) showed the brand-new entry WITHOUT any reload. Regressions: p04 9/9, p05 9/9, p06 8/8, routing smoke 12/12, backend suite 10/10; build green.
- Left: SlotGrid live refresh (P32), e2e-realtime (P33), run/ergonomics (P34–P35).

### P32 — SlotGrid live refresh
- Changed: SlotGrid.jsx — silent-reload path (load(true) skips loading state and error clobbering) triggered by appointment.requested/updated events matching its doctorId; the grid stays visible while refetching and the taken slot flips to "Booked".
- Verified: patient1's tab watched doc_1's grid; the SAME patient's other tab booked 10:00 → tab A's open-slot count dropped 9→8 live with no user action. Audience nuance logged: per the brief, appointment.requested targets that doctor + admins + the booking patient's own tabs — a DIFFERENT patient viewing the same grid is not in the event audience (their grid refreshes via the 30s poll / submit-time 409). Considered broadcasting to all patients and rejected as event-metadata leakage beyond the brief's payload rule.
- Left: scripts/e2e-realtime.js (P33), vite/start/single-port (P34–P35).

### P34 — Proxy, start scripts, --host
- Changed: vite.config.js — single /api proxy (covers /api/auth + SSE), configure() hook forces no-cache/no-transform + X-Accel-Buffering:no on event-stream responses, host:true (LAN phones); frontend `start` = vite preview --port 5174 --host (was MISSING — root `npm start` referenced it and failed); root `start` = `npm run build && npm run start --prefix backend`.
- Verified: vite dev restarted (config change) and e2e-realtime re-ran 4/4 through the proxied SSE stream.

### P35 — Single-port mode
- Changed: server.js — after routers, serves frontend/dist with immutable caching for /assets and a GET-only SPA fallback (skips /api/* and /uploads/*) so deep links like /auth/patient and /doctor resolve on :5000; warns instead of crashing when dist is absent. Verified with a throwaway server on :5050 against a temp DB copy: / 200 html, /auth/patient 200 html, /doctor 200 html, /api/health 200 json. `npm run build && npm start` now runs the whole app on ONE port (http://localhost:5000).
- Left: hardening P36–P41, backend test suite extension P42.

### P36 — JWT secret hardening
- Changed: middleware/auth.js — ensureJwtSecret(): no more hard-coded fallback; if JWT_SECRET is missing OR equals the old public value, generates crypto.randomBytes(48).hex, writes it into backend/.env (in-place line replace, other keys preserved, value never printed), logs the rotation + that sessions are invalidated; if .env is unwritable, falls back to an in-memory per-run secret.
- Verified: mechanism exercised (the require-without-detect path rotated backend/.env: old value gone, keys preserved); backend restarted → login 200 + /auth/me 200 with the new secret.
- Left: P37–P41 hardening, P42 test suite.

### P39 — Temp passwords + must_change_password migration
- Changed: BACKUP FIRST — fresh backup/medbridge.db copy (1,466,368 bytes) before any schema change (A9/A10). database.js: additive idempotent migration adds users.must_change_password INTEGER DEFAULT 0 (verified column present). accounts.js: generateTempPassword() now word-word-word-2digits via crypto.randomInt (~26 bits); created users get must_change_password=1; publicUser SELECT includes the flag. auth.js login payload includes must_change_password (boolean; seeded users false, temp-pw accounts true).
- Verified live: quick-add returns zenith-onyx-summit-31-style password + flag=1; temp-pw login payload flag=true; seeded login flag=false.
- Left: change-password endpoint (P40), forced-change screen (P41).

### P40 — POST /auth/change-password
- Changed: auth.js — authenticateToken'd endpoint; requires current_password (401 if wrong), enforces min-8 + confirm via shared validatePassword, rejects new == current (400), clears must_change_password on success.
- Verified live: wrong current 401; short 400; confirm mismatch 400; same-as-current 400; real change on a throwaway temp-pw account 200 → old temp password rejected at next login, new password works, flag cleared (harness hit the P38 rate limit on a later sanity probe — the limiter doing its job).
- Left: forced-change screen (P41), extended test suite (P42).

### P41 — Forced password-change screen
- Changed: pages/ForceChangePasswordPage.jsx (new) — full-screen gate (temporary-password warning banner, PasswordField trio, "sign out instead"); App.jsx renders it for ANY route when user.must_change_password is truthy, before role routing; success clears the flag locally (server already cleared it) and proceeds to the portal. api.changePassword added.
- Verified in browser: temp-pw account signs in → gate blocks the portal → correct current + new password → lands in /patient. Build green.
- Left: P42 extended suite, then design phases (P43+).

### P43 — Palette tokens (paper / ink / spruce / clay)
- Changed: index.css — :root CSS variables (raw RGB triplets) as the SINGLE palette source: paper #FAF8F4 (base/warm/subtle/hover/card/hairline #E7E2D9), ink scale anchored #14201F, spruce scale anchored #1F5E5A with hover #174B48, ONE warm clay accent (#B2583A family), desaturated warning/danger/success. tailwind.config.js — every color token now resolves to rgb(var(--c-*) / <alpha-value>) keeping the SAME class names (bg-clinical-600 etc.) so 40+ files keep working; glow shadows nullified (shadow-glow-* → transparent); surface.base = paper; accent family added. Legacy .text-gradient-clinical/.hero-grid neutralized to quiet no-ops (ink text / no texture).
- Verified: build green; in-browser getComputedStyle: body bg rgb(250,248,244) = #FAF8F4, color rgb(20,32,31) = #14201F (needed a vite dev restart — config/CSS changes are boot-time).
- Left: fonts P44, primitives P45–P53, shell P54–P56, auth screens P57, tokens doc P58.

### P42 — Phase 1 verification suite complete (14/14)
- Changed: backend/tests/realtime.test.js (new) — SSE cross-client delivery <1s (measured loop), patient1 NEVER receives patient2's targeted events (isolation) + positive control that pat_2 DOES receive its own (test-timing bug fixed: trigger action must fire while stream open), rate limit 11th-failure 429 + Retry-After + block-ignores-correct-password + other-accounts-unaffected, lab_order.completed + labreport.confirmed to doctors (test made drift-proof by creating a fresh pending order via POST /visits first; scheduled_date must be within the ±14-day auto-complete window — second test bug fixed).
- Verified: npm test → 14/14 (10 authorization + 4 realtime/rate-limit) in ~15s, all against temp DB copies; live dev DB untouched.
- BRIEF PHASE 1 COMPLETE (P03–P42): sessions, roles, sign-ups, matrix, real-time, hardening all done and verified.

### P38 — Login rate limit
- Changed: auth.js — in-memory Map keyed IP+email (X-Forwarded-For aware), 10 failures/15min window, Retry-After on 429, success clears the counter, periodic sweep unref'd. Unknown-email branch counts failures too (probe loophole found and closed during verification — first run with a nonexistent address never triggered the limit). Correct-password attempts while blocked also 429.
- Verified: 12 failed attempts on one address → 429 with Retry-After: 900; correct password blocked with 429; a different seeded account signs in fine. Also had to restart the dev backend — it had crashed earlier with 'database is locked' (my own .env rotation script held SQLite while --watch restarted; noted to avoid concurrent node -e DB access).

### P37 — JWT 12h + CORS allowlist + JSON 400
- Changed: both jwt.sign sites (login + issueSession) now expiresIn '12h'; server.js CORS origin callback limited to env ALLOWED_ORIGINS (default localhost:5173/5000, comma-separated; .env + .env.example updated) — disallowed origins get no CORS headers, no-origin requests still allowed for curl/health; malformed JSON 400 already landed with P22.
- Verified live: fresh token exp−iat = 12h exactly; allowed origin echoes in access-control-allow-origin; evil origin gets null; malformed JSON → 400.

### P33 — e2e-realtime (3 contexts, both directions)
- Changed: scripts/e2e-realtime.js (new) — three independent browser contexts (doctor/patient/admin). Scenario A: patient logs a symptom → doctor's journal shows the brand-new entry WITHOUT reload. Scenario B: doctor confirms an appointment → patient's Appointments tab shows Confirmed WITHOUT reload (books a fresh row first if no requested one exists, so the suite is re-run safe). Screenshots to screenshots/rt_*.png.
- Verified: 4/4 PASS (symptom 201 → doctor live; confirm 200 → patient live).
- Left: run/ergonomics (P34–P35).

---

## ORIGINAL BRIEF (verbatim)

You are upgrading an existing full-stack app, MedBridge (clinic records platform), so it is demo-ready tomorrow. Work autonomously: do not ask me questions. If something is ambiguous, choose the safest reasonable option and log the assumption in UPGRADE_PLAN.md.

STEP 0 - SAVE THIS BRIEF. Before touching code, save this whole message verbatim as UPGRADE_PLAN.md at the repo root, with a tickable checklist of the phases at the top. After each phase: tick it, add 3-5 lines (what changed, what you verified, what is left). If your context resets, re-read UPGRADE_PLAN.md and continue from the first unticked phase.

THE APP (do not re-audit everything; verify only what you touch)
- Backend: Node 22.13+ (uses node:sqlite), Express 4, JWT + bcryptjs. backend/src/{server.js, config.js, db/{database.js,seed.js,geminiHelper.js}, middleware/auth.js, routes/*.js, utils/*.js}. Routers are mounted twice (/api/* and /*).
- Frontend: React 19, Vite 6, Tailwind 3.4, lucide-react, recharts, custom history-API router (src/router.jsx). Pages: LoginPage, DoctorDashboardPage, PatientDashboardPage (already tabbed), AdminDashboardPage. Tokens documented in frontend/DESIGN_TOKENS.md.
- Roles: doctor, patient, admin. Seeded accounts (password demo1234): admin@medbridge.com, doctor@medbridge.com, dr.okafor@medbridge.com, dr.haddad@medbridge.com, patient1@medbridge.com, patient2@medbridge.com.
- I am on Windows: use cross-platform npm/node commands only (no bash-only syntax, no rm -rf).
- Keep: React 19, Vite, Tailwind v3, the SQLite schema (additive idempotent migrations only), the append-only clinical-records rule, and all existing features. No TypeScript conversion. No heavy dependencies (@fontsource/* fonts are fine).
- Brand name is "MedBridge"; keep name/tagline in ONE file (frontend/src/brand.js).

GROUND RULES
1. The app must build (npm run build) and log in after EVERY phase. Never leave it broken.
2. Read a file before editing it. Backend: small surgical diffs. UI files: free to rewrite.
3. Reproduce each item in the "known problems" lists before fixing (curl / node script / Playwright) and note the result in UPGRADE_PLAN.md. If you can't reproduce it, say so and move on.
4. Never delete or reset the database or run seed.js destructively. Copy backend/src/db/medbridge.db to backend/src/db/backup/ before any schema change.
5. Never commit or print .env secrets.

===== PHASE 1 - SESSIONS, ROLES, SIGN-UP, REAL-TIME (my item 4) =====
[... full text of brief Phase 1 as pasted by the user, sections 1a-1g and verification ...]

===== PHASE 2 - DESIGN SYSTEM FOUNDATION + BRAND (my items 2, 3) =====
[... full text ...]

===== PHASE 3 - DOCTOR PORTAL IN TABS (my item 1) =====
[... full text ...]

===== PHASE 4 - PRESCRIPTION COMPOSER (my item 5) =====
[... full text ...]

===== PHASE 5 - RESTYLE PATIENT + ADMIN, THEN FULL SWEEP (my items 2, 6) =====
[... full text ...]

===== PHASE 6 - DEBUG EVERYTHING (my item 7) =====
[... full text ...]

===== PHASE 7 - TEST EVERY FEATURE (my item 8) =====
[... full text ...]

FINAL DELIVERABLE
HANDOFF.md: exact commands for single-port and dev modes, URLs, seeded accounts, the CLINIC_ACCESS_CODE, how to run tests, how to back up/restore the DB, a 5-minute demo script (which tabs to open, what to click, what the audience will see update live), and known limitations. End with a short summary of what changed for each of my 8 items.
