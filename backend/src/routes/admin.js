const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createUserAccount, AccountValidationError, publicUser } = require('../utils/accounts');
const { localDateStr } = require('../utils/scheduling');

// Every route below requires an authenticated admin (Phases 26, 35)
router.use(authenticateToken, requireRole('admin'));

function todayStr() {
  return localDateStr();
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * GET /admin/stats — overview numbers (Phase 27).
 */
router.get('/stats', (req, res) => {
  try {
    const today = todayStr();
    const doctors = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'doctor'").get().n;
    const patients = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'patient'").get().n;
    const activeAccounts = db.prepare('SELECT COUNT(*) n FROM users WHERE is_active = 1').get().n;
    const inactiveAccounts = db.prepare('SELECT COUNT(*) n FROM users WHERE is_active = 0').get().n;
    const appointmentsToday = db.prepare(
      "SELECT COUNT(*) n FROM appointments WHERE appointment_date = ? AND status != 'cancelled'"
    ).get(today).n;
    const pendingRequests = db.prepare(
      "SELECT COUNT(*) n FROM appointments WHERE status = 'requested'"
    ).get().n;
    const pendingLabReviews = db.prepare(
      "SELECT COUNT(*) n FROM lab_report_uploads WHERE status = 'pending_review'"
    ).get().n;

    res.json({
      doctors,
      patients,
      appointments_today: appointmentsToday,
      pending_requests: pendingRequests,
      pending_lab_reviews: pendingLabReviews,
      active_accounts: activeAccounts,
      inactive_accounts: inactiveAccounts
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to load admin stats' });
  }
});

/**
 * GET /admin/doctors?search= — list with search by name/email/specialization (Phase 28).
 */
router.get('/doctors', (req, res) => {
  try {
    const q = (req.query.search || '').trim().toLowerCase();
    let rows = db.prepare(`
      SELECT id, name, email, specialization, is_active, created_at,
        (SELECT COUNT(*) FROM visits v WHERE v.doctor_id = users.id) AS visit_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = users.id AND a.status != 'cancelled') AS appointment_count
      FROM users
      WHERE role = 'doctor'
      ORDER BY name ASC
    `).all();

    if (q) {
      rows = rows.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.specialization || '').toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q)
      );
    }
    res.json(rows);
  } catch (error) {
    console.error('Error listing doctors (admin):', error);
    res.status(500).json({ error: 'Failed to list doctors' });
  }
});

/**
 * POST /admin/doctors — create a doctor account (Phase 29).
 * Body: { name, email, specialization } → temp password shown once.
 */
router.post('/doctors', (req, res) => {
  try {
    const { name, email, specialization } = req.body;
    const { user, tempPassword } = createUserAccount({ role: 'doctor', name, email, specialization });
    res.status(201).json({
      message: 'Doctor account created. Share the temporary password now — it is shown only once.',
      user,
      temp_password: tempPassword
    });
  } catch (error) {
    if (error instanceof AccountValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error creating doctor (admin):', error);
    res.status(500).json({ error: 'Failed to create doctor account' });
  }
});

/**
 * GET /admin/patients?search= — list with search by name/email (Phase 30).
 */
router.get('/patients', (req, res) => {
  try {
    const q = (req.query.search || '').trim().toLowerCase();
    let rows = db.prepare(`
      SELECT id, name, email, dob, gender, phone, is_active, created_at,
        (SELECT COUNT(*) FROM visits v WHERE v.patient_id = users.id) AS visit_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = users.id AND a.status != 'cancelled') AS appointment_count
      FROM users
      WHERE role = 'patient'
      ORDER BY name ASC
    `).all();

    if (q) {
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
      );
    }
    res.json(rows);
  } catch (error) {
    console.error('Error listing patients (admin):', error);
    res.status(500).json({ error: 'Failed to list patients' });
  }
});

/**
 * POST /admin/patients — create a patient account (Phase 31).
 * Body: { name, email, dob, gender?, phone? } → temp password shown once.
 */
router.post('/patients', (req, res) => {
  try {
    const { name, email, dob, gender, phone } = req.body;
    const { user, tempPassword } = createUserAccount({ role: 'patient', name, email, dob, gender, phone });
    res.status(201).json({
      message: 'Patient account created. Share the temporary password now — it is shown only once.',
      user,
      temp_password: tempPassword
    });
  } catch (error) {
    if (error instanceof AccountValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error creating patient (admin):', error);
    res.status(500).json({ error: 'Failed to create patient account' });
  }
});

/**
 * PATCH /admin/users/:id/status — activate/deactivate (Phase 33).
 * Body: { is_active: true|false }. Blocks login only; clinical history untouched.
 */
router.patch('/users/:id/status', (req, res) => {
  try {
    const target = db.prepare('SELECT id, name, role, is_active FROM users WHERE id = ?').get(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Account not found' });
    }
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own admin account' });
    }
    if (target.role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts cannot be deactivated from the portal' });
    }
    const desired = req.body.is_active;
    if (typeof desired !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be true or false' });
    }
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(desired ? 1 : 0, target.id);
    const updated = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id));
    res.json({
      message: desired
        ? `${target.name} reactivated — they can sign in again.`
        : `${target.name} deactivated — sign-in blocked; all history is untouched.`,
      user: updated
    });
  } catch (error) {
    console.error('Error updating account status (admin):', error);
    res.status(500).json({ error: 'Failed to update account status' });
  }
});

/**
 * GET /admin/appointments?status=&date=&doctor_id= — global read-only list (Phase 34).
 */
router.get('/appointments', (req, res) => {
  try {
    let sql = `
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.appointment_time, a.reason,
             a.status, a.proposed_date, a.proposed_time, a.created_at,
             pat.name AS patient_name, pat.email AS patient_email,
             doc.name AS doctor_name, doc.specialization AS doctor_specialization
      FROM appointments a
      JOIN users pat ON a.patient_id = pat.id
      JOIN users doc ON a.doctor_id = doc.id
      WHERE 1=1
    `;
    const params = [];
    if (req.query.status) {
      sql += ' AND a.status = ?';
      params.push(String(req.query.status));
    }
    if (req.query.date && DATE_RE.test(String(req.query.date))) {
      sql += ' AND a.appointment_date = ?';
      params.push(String(req.query.date));
    }
    if (req.query.doctor_id) {
      sql += ' AND a.doctor_id = ?';
      params.push(String(req.query.doctor_id));
    }
    sql += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 500';
    res.json(db.prepare(sql).all(...params));
  } catch (error) {
    console.error('Error listing appointments (admin):', error);
    res.status(500).json({ error: 'Failed to list appointments' });
  }
});

/**
 * GET /admin/doctors/:id + /admin/patients/:id — read-only detail (Phase 39):
 * account fields + clinical summary counts. No edit surface by design.
 */
router.get('/doctors/:id', (req, res) => {
  try {
    const doctor = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'doctor'").get(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    const counts = {
      visits: db.prepare('SELECT COUNT(*) n FROM visits WHERE doctor_id = ?').get(doctor.id).n,
      prescriptions: db.prepare(`
        SELECT COUNT(*) n FROM prescriptions p JOIN visits v ON p.visit_id = v.id WHERE v.doctor_id = ?
      `).get(doctor.id).n,
      appointments: db.prepare("SELECT COUNT(*) n FROM appointments WHERE doctor_id = ? AND status != 'cancelled'").get(doctor.id).n
    };
    res.json({ user: publicUser(doctor), clinical_summary: counts });
  } catch (error) {
    console.error('Error fetching doctor detail (admin):', error);
    res.status(500).json({ error: 'Failed to load doctor detail' });
  }
});

router.get('/patients/:id', (req, res) => {
  try {
    const patient = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'patient'").get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const counts = {
      visits: db.prepare('SELECT COUNT(*) n FROM visits WHERE patient_id = ?').get(patient.id).n,
      self_logs: db.prepare('SELECT COUNT(*) n FROM self_logs WHERE patient_id = ?').get(patient.id).n,
      appointments: db.prepare("SELECT COUNT(*) n FROM appointments WHERE patient_id = ? AND status != 'cancelled'").get(patient.id).n,
      pending_lab_orders: db.prepare(`
        SELECT COUNT(*) n FROM lab_orders lo JOIN visits v ON lo.visit_id = v.id
        WHERE v.patient_id = ? AND lo.status = 'pending'
      `).get(patient.id).n
    };
    res.json({ user: publicUser(patient), clinical_summary: counts });
  } catch (error) {
    console.error('Error fetching patient detail (admin):', error);
    res.status(500).json({ error: 'Failed to load patient detail' });
  }
});

module.exports = router;
