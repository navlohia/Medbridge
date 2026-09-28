/**
 * Round 2 Block VI integration test (Phases 90–93).
 * Requires dev server on :5000, freshly seeded.
 * NOTE: GEMINI_API_KEY is currently EMPTY in .env, so the AI-reading path is
 * exercised as its designed graceful fallback (needs_manual_entry) and the
 * manual-entry → confirm → auto-complete pipeline is verified end to end.
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

// 1x1 red PNG (smallest valid PNG) for pipeline tests
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  const pat = await req('POST', '/auth/login', { email: 'patient1@medbridge.com', password: 'demo1234' });
  const doc = await req('POST', '/auth/login', { email: 'doctor@medbridge.com', password: 'demo1234' });
  const patT = pat.body.token, docT = doc.body.token;
  check('logins ok', pat.status === 200 && doc.status === 200);

  // Phase 90 (adapted for empty key): upload → pending_review with needs_manual_entry
  const up = await req('POST', '/lab-reports/upload', {
    image_base64: TINY_PNG_BASE64, mime_type: 'image/png'
  }, patT);
  check('upload accepted → 201 pending_review', up.status === 201 &&
    up.body.upload?.status === 'pending_review', JSON.stringify(up.body).slice(0, 140));
  check('unreadable/blank image → graceful needs_manual_entry (not 500)',
    up.body.upload?.needs_manual_entry === true &&
    typeof up.body.upload?.ai_notice === 'string', JSON.stringify(up.body.upload).slice(0, 160));
  const uploadId = up.body.upload?.id;

  // Phase 82: GET single returns the pending extraction for review
  const single = await req('GET', `/lab-reports/${uploadId}`, null, patT);
  check('GET /lab-reports/:id returns pending rows + notice', single.status === 200 &&
    Array.isArray(single.body.rows) && single.body.rows.length === 0 &&
    single.body.status === 'pending_review');

  // Ownership: another patient cannot read it
  const pat2 = await req('POST', '/auth/login', { email: 'patient2@medbridge.com', password: 'demo1234' });
  const foreign = await req('GET', `/lab-reports/${uploadId}`, null, pat2.body.token);
  check('foreign patient gets 404 on someone else\'s upload', foreign.status === 404);

  // Self-sufficient setup: create a fresh pending lab order via a doctor visit
  // (scheduled +3 days → within the ±14-day auto-complete window), so this suite
  // passes regardless of which other suites ran first.
  const d3 = new Date(); d3.setDate(d3.getDate() + 3);
  const plus3 = `${d3.getFullYear()}-${String(d3.getMonth() + 1).padStart(2, '0')}-${String(d3.getDate()).padStart(2, '0')}`;
  const orderVisit = await req('POST', '/visits', {
    patient_id: 'pat_1', diagnosis_id: 'diag_1', notes: 'Lab-report suite: creates pending FBS order',
    lab_orders: [{ test_name: 'Fasting Blood Sugar', scheduled_date: plus3 }]
  }, docT);
  check('setup: pending FBS lab order created via visit', orderVisit.status === 201);

  // Manual entry through the review path (the designed fallback, Phase 87):
  // patient adds the FBS row by hand and confirms with today's date.
  const confirm = await req('POST', `/lab-reports/${uploadId}/confirm`, {
    report_date: localToday(),
    rows: [{ test_name: 'Fasting Blood Sugar', value: '95', unit: 'mg/dL', include: true }]
  }, patT);
  check('confirm writes rows → 201', confirm.status === 201, JSON.stringify(confirm.body).slice(0, 200));
  check('autoCompleteLabOrders fired (matched pending order)', confirm.body?.matched_order_count >= 1,
    JSON.stringify(confirm.body).slice(0, 200));

  // Rows landed in self_logs like a manually logged vital (Phase 90)
  const logs = await req('GET',
    `/patients/pat_1/self-logs?type=vital&label=${encodeURIComponent('Fasting Blood Sugar')}`, null, patT);
  const last = logs.body.logs?.slice(-1)[0];
  check('confirmed value landed in self_logs pipeline', last?.value === '95' && last?.unit === 'mg/dL',
    JSON.stringify(last));

  // The pending lab order actually completed (Phase 90)
  const dash = await req('GET', '/patients/pat_1/dashboard', null, patT);
  const fbsStillPending = dash.body.pending_labs?.some(l => l.test_name === 'Fasting Blood Sugar');
  check('matching pending lab order auto-completed (gone from pending list)', fbsStillPending === false,
    JSON.stringify(dash.body.pending_labs));

  // Permanence (Phase 92): confirmed upload can't be discarded or re-confirmed
  const discardConfirmed = await req('POST', `/lab-reports/${uploadId}/discard`, {}, patT);
  check('confirmed upload cannot be discarded (409, append-only)', discardConfirmed.status === 409 &&
    /permanent/i.test(discardConfirmed.body?.error || ''));
  const reConfirm = await req('POST', `/lab-reports/${uploadId}/confirm`, {
    report_date: localToday(), rows: [{ test_name: 'Weight', value: '70', unit: 'kg' }]
  }, patT);
  check('confirmed upload cannot be re-confirmed (409)', reConfirm.status === 409);

  // History list shows the confirmed upload (Phase 86)
  const history = await req('GET', '/lab-reports', null, patT);
  const histRow = history.body.find(h => h.id === uploadId);
  check('upload history lists confirmed report with row count', histRow &&
    histRow.status === 'confirmed' && histRow.row_count === 1, JSON.stringify(histRow));

  // Phase 92: discard a pending upload → disappears from history
  const up2 = await req('POST', '/lab-reports/upload', {
    image_base64: TINY_PNG_BASE64, mime_type: 'image/png'
  }, patT);
  const discard = await req('POST', `/lab-reports/${up2.body.upload?.id}/discard`, {}, patT);
  check('pending upload discard succeeds', discard.status === 200);
  const history2 = await req('GET', '/lab-reports', null, patT);
  check('discarded upload gone from history', !history2.body.some(h => h.id === up2.body.upload?.id));

  // Validation guards (Phases 77, 88)
  const badMime = await req('POST', '/lab-reports/upload', {
    image_base64: TINY_PNG_BASE64, mime_type: 'application/pdf'
  }, patT);
  check('PDF rejected with clear message (photos only, documented gap)', badMime.status === 400 &&
    /JPG or PNG/i.test(badMime.body?.error || ''));
  const noImage = await req('POST', '/lab-reports/upload', { mime_type: 'image/png' }, patT);
  check('missing image rejected 400', noImage.status === 400);
  const oversize = await req('POST', '/lab-reports/upload', {
    image_base64: 'A'.repeat(7_000_000), mime_type: 'image/png'
  }, patT);
  check('oversize image rejected 400 (5 MB cap)', oversize.status === 400 &&
    /too large/i.test(oversize.body?.error || ''));

  // Role guard: doctors cannot upload/review (patient-only surface)
  const docUpload = await req('POST', '/lab-reports/upload', {
    image_base64: TINY_PNG_BASE64, mime_type: 'image/png'
  }, docT);
  check('doctor blocked from upload endpoint (403)', docUpload.status === 403);

  // Regression: manual vital logging still auto-completes (shared util intact).
  // Creates its own pending order first so it is independent of seed state.
  const d7 = new Date(); d7.setDate(d7.getDate() + 7);
  const plus7 = `${d7.getFullYear()}-${String(d7.getMonth() + 1).padStart(2, '0')}-${String(d7.getDate()).padStart(2, '0')}`;
  await req('POST', '/visits', {
    patient_id: 'pat_1', diagnosis_id: 'diag_1', notes: 'Lab-report suite: pending WBC order for manual-vital check',
    lab_orders: [{ test_name: 'WBC Count', scheduled_date: plus7 }]
  }, docT);
  const manualVital = await req('POST', '/self-logs', {
    log_type: 'vital', label: 'WBC Count', value: '6.2', unit: '×10⁹/L', log_date: localToday()
  }, patT);
  check('manual vital still auto-completes matching order (shared util)', manualVital.status === 201 &&
    manualVital.body.completed_lab_orders?.length >= 1, JSON.stringify(manualVital.body).slice(0, 160));

  console.log(`\n=== Round 2 Block VI: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('Test crashed:', e); process.exit(1); });
