/**
 * Round 2 Block V integration test (Phases 68–75).
 * Requires dev server on :5000, freshly seeded (node src/db/seed.js with backend stopped).
 */
const BASE = 'http://127.0.0.1:5000/api';

async function req(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* */ }
  return { status: res.status, body: data };
}

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
}

const SLOT = '10:00';
function dateFromToday(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  const pat = await req('POST', '/auth/login', { email: 'patient1@medbridge.com', password: 'demo1234' });
  const pat2 = await req('POST', '/auth/login', { email: 'patient2@medbridge.com', password: 'demo1234' });
  const doc = await req('POST', '/auth/login', { email: 'doctor@medbridge.com', password: 'demo1234' });
  const patT = pat.body.token, pat2T = pat2.body.token, docT = doc.body.token;
  check('logins ok', pat.status === 200 && pat2.status === 200 && doc.status === 200);

  // Availability (Phase 68 part 1)
  const target = dateFromToday(3);
  const avail = await req('GET', `/appointments/availability?doctor_id=doc_1&date=${target}`, null, patT);
  check('availability returns full day grid', avail.status === 200 && Array.isArray(avail.body.slots) &&
    avail.body.slots.length > 0, JSON.stringify(avail.body).slice(0, 120));
  const slot = avail.body.slots.find(s => s.time === SLOT);
  check('target slot exists and is available', slot && slot.available === true);

  // Book the slot (Phase 68 part 2)
  const book = await req('POST', '/appointments', {
    doctor_id: 'doc_1', appointment_date: target, appointment_time: SLOT, reason: 'Round 2 slot test'
  }, patT);
  check('booking free slot succeeds (201)', book.status === 201, JSON.stringify(book.body));
  const aptId = book.body.appointment?.id;

  // Slot now shows unavailable (Phase 68 part 3)
  const avail2 = await req('GET', `/appointments/availability?doctor_id=doc_1&date=${target}`, null, pat2T);
  const slot2 = avail2.body.slots.find(s => s.time === SLOT);
  check('booked slot shows unavailable to a second patient', slot2 && slot2.available === false);

  // Second patient attempts same slot → specific 409 (Phases 58, 71)
  const race = await req('POST', '/appointments', {
    doctor_id: 'doc_1', appointment_date: target, appointment_time: SLOT, reason: 'race attempt'
  }, pat2T);
  check('lost race gets specific 409 "just booked"', race.status === 409 &&
    /just booked/i.test(race.body?.error || ''), JSON.stringify(race.body));

  // Booking without time → 400 (Phase 57)
  const noTime = await req('POST', '/appointments', { doctor_id: 'doc_1', appointment_date: target }, patT);
  check('booking without time rejected 400', noTime.status === 400);

  // Off-schedule slot → 400 (Phase 72)
  const offSchedule = await req('POST', '/appointments', {
    doctor_id: 'doc_1', appointment_date: target, appointment_time: '06:30'
  }, patT);
  check('off-schedule time rejected (not in grid)', offSchedule.status === 400);
  const sunday = dateFromToday((7 - new Date().getDay()) % 7 || 7); // next Sunday
  const sundayAvail = await req('GET', `/appointments/availability?doctor_id=doc_1&date=${sunday}`, null, patT);
  check('day off (Sunday) has zero slots', sundayAvail.status === 200 && sundayAvail.body.slots.length === 0,
    JSON.stringify(sundayAvail.body).slice(0, 100));

  // Past-time exclusion for today (Phase 72): every slot at or before the
  // server's current wall clock must be unavailable (vacuously true before
  // clinic hours; the rule itself is what's under test).
  const today = dateFromToday(0);
  const nowHHMM = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const todayAvail = await req('GET', `/appointments/availability?doctor_id=doc_1&date=${today}`, null, patT);
  const pastSlots = todayAvail.body.slots.filter(s => s.time <= nowHHMM);
  const futureOpen = todayAvail.body.slots.filter(s => s.time > nowHHMM && s.available);
  check('today: no past-time slot is available (server clock)', pastSlots.every(s => s.available === false) &&
    (pastSlots.length === 0 ? futureOpen.length > 0 : true), `now=${nowHHMM} past=${pastSlots.length} futureOpen=${futureOpen.length}`);

  // Reschedule: doctor proposes a different free slot (Phase 69) — chosen
  // dynamically so the suite is re-run-safe against prior runs' bookings.
  const newSlot = avail.body.slots.find(s => s.available && s.time !== SLOT);
  check('alternative slot exists for reschedule', Boolean(newSlot));
  const propose = await req('PATCH', `/appointments/${aptId}/propose-reschedule`, {
    proposed_date: target, proposed_time: newSlot.time, proposed_reason: 'Clinic schedule shifted'
  }, docT);
  check('doctor proposes reschedule (row → reschedule_proposed)', propose.status === 200 &&
    propose.body.appointment?.status === 'reschedule_proposed', JSON.stringify(propose.body));

  // Patient sees both times (Phase 69 part 2)
  const mine = await req('GET', '/appointments/mine', null, patT);
  const mineRow = mine.body.find(a => a.id === aptId);
  check('patient sees original + proposed times + reason', mineRow &&
    mineRow.appointment_time === SLOT && mineRow.proposed_time === newSlot.time &&
    mineRow.proposed_reason === 'Clinic schedule shifted');

  // Proposed slot is tentatively held (Phase 54)
  const avail3 = await req('GET', `/appointments/availability?doctor_id=doc_1&date=${target}`, null, pat2T);
  const propSlot = avail3.body.slots.find(s => s.time === newSlot.time);
  check('proposed slot held (unavailable to others)', propSlot && propSlot.available === false);

  // Original slot also still held while proposal open
  const origSlot = avail3.body.slots.find(s => s.time === SLOT);
  check('original slot still held while proposal open', origSlot && origSlot.available === false);

  // Patient accepts → confirmed at new time (Phase 69 part 3)
  const accept = await req('PATCH', `/appointments/${aptId}/respond-reschedule`, { accept: true }, patT);
  check('patient accepts → confirmed at new time', accept.status === 200 &&
    accept.body.appointment?.status === 'confirmed' &&
    accept.body.appointment?.appointment_time === newSlot.time &&
    accept.body.appointment?.proposed_time === null, JSON.stringify(accept.body));

  // Slot math reflects the move: old slot free, new slot held (Phase 69 part 4)
  const avail4 = await req('GET', `/appointments/availability?doctor_id=doc_1&date=${target}`, null, pat2T);
  const oldFreed = avail4.body.slots.find(s => s.time === SLOT);
  const newHeld = avail4.body.slots.find(s => s.time === newSlot.time);
  check('after accept: original freed, new slot occupied', oldFreed?.available === true && newHeld?.available === false);

  // Decline path (Phase 70): book, propose, decline → cancelled + slot released
  const declineSlot = avail.body.slots.find(s => s.available && s.time !== SLOT && s.time !== newSlot.time);
  const declineTarget = declineSlot.time;
  const book2 = await req('POST', '/appointments', {
    doctor_id: 'doc_1', appointment_date: target, appointment_time: declineTarget, reason: 'decline test'
  }, pat2T);
  check('second booking for decline test', book2.status === 201, JSON.stringify(book2.body));
  const apt2 = book2.body.appointment.id;
  const propose2 = await req('PATCH', `/appointments/${apt2}/propose-reschedule`, {
    proposed_date: target, proposed_time: '15:30', proposed_reason: 'Trying to move you'
  }, docT);
  check('second proposal created', propose2.status === 200);
  const decline = await req('PATCH', `/appointments/${apt2}/respond-reschedule`, { accept: false }, pat2T);
  check('patient declines → cancelled', decline.status === 200 &&
    decline.body.appointment?.status === 'cancelled');
  const avail5 = await req('GET', `/appointments/availability?doctor_id=doc_1&date=${target}`, null, patT);
  const freedDecline = avail5.body.slots.find(s => s.time === declineTarget);
  check('decline releases the original slot', freedDecline?.available === true);

  // Ownership guards (Phase 63)
  const respondAsDoc = await req('PATCH', `/appointments/${aptId}/respond-reschedule`, { accept: true }, docT);
  check('doctor cannot respond to reschedule (patient-only)', respondAsDoc.status === 403);
  const proposeAsPat = await req('PATCH', `/appointments/${aptId}/propose-reschedule`, {
    proposed_date: target, proposed_time: '11:00'
  }, patT);
  check('patient cannot propose reschedule (doctor-only)', proposeAsPat.status === 403);

  // Phase 64: doctor cancels while proposal open → patient response gets 409
  const movedSlot = avail.body.slots.find(s =>
    s.available && s.time !== SLOT && s.time !== newSlot.time && s.time !== declineTarget);
  const book3 = await req('POST', '/appointments', {
    doctor_id: 'doc_1', appointment_date: target, appointment_time: movedSlot.time, reason: 'moved-on test'
  }, patT);
  const apt3 = book3.body.appointment.id;
  const movedProposed = avail.body.slots.find(s =>
    s.available && ![SLOT, newSlot.time, declineTarget, movedSlot.time].includes(s.time));
  await req('PATCH', `/appointments/${apt3}/propose-reschedule`, {
    proposed_date: target, proposed_time: movedProposed.time
  }, docT);
  const docCancel = await req('PATCH', `/appointments/${apt3}/status`, { status: 'cancelled' }, docT);
  check('doctor can cancel a proposal-open appointment', docCancel.status === 200, JSON.stringify(docCancel.body));
  const lateRespond = await req('PATCH', `/appointments/${apt3}/respond-reschedule`, { accept: true }, patT);
  check('late patient response to dead proposal → clear 409', lateRespond.status === 409 &&
    /no longer applies|cancelled/i.test(lateRespond.body?.error || ''), JSON.stringify(lateRespond.body));

  // Day View (Phase 65)
  const dayView = await req('GET', `/appointments/doctor/day?date=${target}`, null, docT);
  check('doctor Day View lists booked slots ordered', dayView.status === 200 &&
    Array.isArray(dayView.body.booked) && dayView.body.booked.some(b => b.appointment_time === newSlot.time),
    JSON.stringify(dayView.body).slice(0, 150));

  // Round-1 simple confirm path still works unchanged (Phases 66, 75)
  const classicSlot = avail.body.slots.find(s =>
    s.available && ![SLOT, newSlot.time, declineTarget, movedSlot.time, movedProposed.time].includes(s.time));
  const book4 = await req('POST', '/appointments', {
    doctor_id: 'doc_1', appointment_date: target, appointment_time: classicSlot.time, reason: 'classic path'
  }, patT);
  const apt4 = book4.body.appointment.id;
  const confirmClassic = await req('PATCH', `/appointments/${apt4}/status`, { status: 'confirmed' }, docT);
  check('classic confirm/decline path unchanged', confirmClassic.status === 200 &&
    confirmClassic.body.appointment?.status === 'confirmed');

  // Phase 73: visit-created appointment carries a time (default 09:00)
  const visit = await req('POST', '/visits', {
    patient_id: 'pat_1', diagnosis_id: 'diag_1', notes: 'Round 2 visit-time check',
    next_appointment_date: dateFromToday(10), next_appointment_time: '13:30',
    appointment_reason: 'Follow-up with explicit time'
  }, docT);
  check('visit with explicit next-appointment time accepted', visit.status === 201, JSON.stringify(visit.body));
  const dash = await req('GET', '/patients/pat_1/dashboard', null, patT);
  const createdTimeApt = dash.body.pending_labs !== undefined &&
    (await req('GET', '/appointments/mine', null, patT)).body.find(a =>
      a.appointment_date === dateFromToday(10) && a.appointment_time === '13:30');
  check('visit-created appointment has time 13:30', Boolean(createdTimeApt));

  // Phase 74: drug-conflict logic untouched
  // The medicine catalog is token-gated (any role may read), so this call
  // needs a session. It used to pass `null` and then called .find() on the
  // 401 body, which crashed the whole run after 20 passes.
  const meds = await req('GET', '/medicines?q=Metformin', null, docT);
  const medList = Array.isArray(meds.body) ? meds.body : (meds.body.medicines || []);
  const antiDiabetic = medList.find(m => m.therapeutic_class === 'Antidiabetic');
  check('medicines search returns a list', medList.length > 0,
    `status=${meds.status} body=${JSON.stringify(meds.body).slice(0, 120)}`);
  const conflict = await req('POST', '/visits/check-conflicts', {
    patient_id: 'pat_1', medicine_ids: [antiDiabetic?.id]
  }, docT);
  check('drug-conflict engine still returns warnings', conflict.status === 200 &&
    conflict.body.conflict_warnings?.length > 0);

  console.log(`\n=== Round 2 Block V: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('Test crashed:', e); process.exit(1); });
