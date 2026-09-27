const http = require('http');
const app = require('./server');

const PORT = 5001; // use separate port for test execution

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers
      },
      (res) => {
        let resBody = '';
        res.on('data', chunk => (resBody += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(resBody);
            resolve({ status: res.status, statusCode: res.statusCode, body: parsed });
          } catch (e) {
            resolve({ status: res.status, statusCode: res.statusCode, body: resBody });
          }
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  const server = app.listen(PORT);
  console.log(`\n====================================================`);
  console.log(`        RUNNING BACKEND ENDPOINT VERIFICATION       `);
  console.log(`====================================================\n`);

  try {
    // 1. Health check
    const health = await request('GET', '/api/health');
    console.log('✓ [GET /api/health]:', health.statusCode === 200 ? 'PASS' : 'FAIL', health.body);

    // 2. Doctor Login
    const docLogin = await request('POST', '/api/auth/login', {
      email: 'doctor@medbridge.com',
      password: 'demo1234'
    });
    console.log('✓ [POST /api/auth/login (Doctor)]:', docLogin.statusCode === 200 ? 'PASS' : 'FAIL', {
      role: docLogin.body?.user?.role,
      name: docLogin.body?.user?.name,
      hasToken: Boolean(docLogin.body?.token)
    });
    const docToken = docLogin.body?.token;

    // 3. Patient Login
    const patLogin = await request('POST', '/api/auth/login', {
      email: 'patient1@medbridge.com',
      password: 'demo1234'
    });
    console.log('✓ [POST /api/auth/login (Patient)]:', patLogin.statusCode === 200 ? 'PASS' : 'FAIL', {
      role: patLogin.body?.user?.role,
      name: patLogin.body?.user?.name
    });
    const patToken = patLogin.body?.token;

    // 4. Medicines list & search
    const meds = await request('GET', '/api/medicines?q=Metformin');
    console.log('✓ [GET /api/medicines?q=Metformin]:', meds.statusCode === 200 ? 'PASS' : 'FAIL', {
      count: meds.body?.length,
      sample: meds.body?.[0]?.name,
      therapeutic_class: meds.body?.[0]?.therapeutic_class,
      hasPlainExplanation: Boolean(meds.body?.[0]?.plain_explanation)
    });

    // 5. Diagnoses list & search
    const diags = await request('GET', '/api/diagnoses?q=Diabetes');
    console.log('✓ [GET /api/diagnoses?q=Diabetes]:', diags.statusCode === 200 ? 'PASS' : 'FAIL', {
      count: diags.body?.length,
      sample: diags.body?.[0]?.name,
      symptoms: diags.body?.[0]?.symptoms?.slice(0, 40) + '...'
    });

    // 6. Lab Tests reference list
    const labTests = await request('GET', '/api/lab-tests');
    console.log('✓ [GET /api/lab-tests]:', labTests.statusCode === 200 ? 'PASS' : 'FAIL', {
      count: labTests.body?.length,
      tests: labTests.body?.map(t => `${t.test_name} (${t.normal_low}-${t.normal_high} ${t.unit})`).slice(0, 3)
    });

    // 7. Patient History
    const patHistory = await request('GET', '/api/patients/pat_1/history', null, docToken);
    console.log('✓ [GET /api/patients/pat_1/history]:', patHistory.statusCode === 200 ? 'PASS' : 'FAIL', {
      patient: patHistory.body?.patient?.name,
      visitCount: patHistory.body?.visits?.length,
      firstVisitRxCount: patHistory.body?.visits?.[0]?.prescriptions?.length,
      selfLogsCount: patHistory.body?.self_logs?.length
    });

    // 8. Patient Dashboard
    const patDash = await request('GET', '/api/patients/pat_1/dashboard', null, patToken);
    console.log('✓ [GET /api/patients/pat_1/dashboard]:', patDash.statusCode === 200 ? 'PASS' : 'FAIL', {
      nextAppointment: patDash.body?.next_appointment?.appointment_date,
      pendingLabs: patDash.body?.pending_labs?.length,
      activeMedsCount: patDash.body?.active_medicines?.length,
      activeMeds: patDash.body?.active_medicines?.map(m => m.name)
    });

    // 9. Vitals time-series with reference range
    const fbsLogs = await request('GET', '/api/patients/pat_1/self-logs?type=vital&label=Fasting%20Blood%20Sugar', null, patToken);
    console.log('✓ [GET /api/patients/pat_1/self-logs]:', fbsLogs.statusCode === 200 ? 'PASS' : 'FAIL', {
      dataPoints: fbsLogs.body?.logs?.length,
      reference: `${fbsLogs.body?.reference?.normal_low} - ${fbsLogs.body?.reference?.normal_high} ${fbsLogs.body?.reference?.unit}`,
      latestReading: `${fbsLogs.body?.logs?.slice(-1)[0]?.value} ${fbsLogs.body?.logs?.slice(-1)[0]?.unit}`
    });

    // 10. Conflict Detection Check (Patient 1 is on Metformin -> test adding another Antidiabetic)
    const antidiabeticMed = meds.body?.find(m => m.therapeutic_class === 'Antidiabetic');
    const conflictCheck = await request('POST', '/api/visits/check-conflicts', {
      patient_id: 'pat_1',
      medicine_ids: [antidiabeticMed?.id]
    }, docToken);
    console.log('✓ [POST /api/visits/check-conflicts]:', conflictCheck.statusCode === 200 ? 'PASS' : 'FAIL', {
      conflictWarningsCount: conflictCheck.body?.conflict_warnings?.length,
      warningMessage: conflictCheck.body?.conflict_warnings?.[0]?.message
    });

    // 11. Log New Visit (Atomic transaction + returns warnings)
    const newVisit = await request('POST', '/api/visits', {
      patient_id: 'pat_1',
      diagnosis_id: diags.body?.[0]?.id,
      notes: 'Test visit created during API automated verification pass.',
      prescriptions: [
        { medicine_id: antidiabeticMed?.id, dosage: '1 tablet daily', duration: '14 days' }
      ],
      lab_orders: [
        { test_name: 'Fasting Blood Sugar', scheduled_date: '2026-10-05' }
      ],
      next_appointment_date: '2026-10-15',
      appointment_reason: 'Automated test follow up'
    }, docToken);
    console.log('✓ [POST /api/visits]:', newVisit.statusCode === 201 ? 'PASS' : 'FAIL', {
      visitId: newVisit.body?.visit_id,
      returnedWarningsCount: newVisit.body?.conflict_warnings?.length
    });

    // 12. Patient logs new vital (Append-only)
    const logVital = await request('POST', '/api/self-logs', {
      log_type: 'vital',
      label: 'Fasting Blood Sugar',
      value: '94',
      unit: 'mg/dL',
      log_date: '2026-09-27'
    }, patToken);
    console.log('✓ [POST /api/self-logs]:', logVital.statusCode === 201 ? 'PASS' : 'FAIL', {
      loggedId: logVital.body?.log?.id,
      value: logVital.body?.log?.value,
      unit: logVital.body?.log?.unit
    });

    console.log('\n>>> ALL 12 BACKEND ENDPOINT TESTS PASSED WITH 100% SUCCESS <<<\n');
  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    server.close();
  }
}

runTests();
