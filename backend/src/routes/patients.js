const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createUserAccount, AccountValidationError } = require('../utils/accounts');

// GET /doctors route lives in routes/doctors.js (mounted at /doctors)

/**
 * POST /patients — Doctor quick-add of a walk-in patient (Round 2 Phases 46–49).
 * Deliberately light: name, email, DOB. Shares the exact same validation and
 * password-generation utility as the admin create routes (Block III Phase 32).
 * Response returns the generated temp password once, formatted to hand over.
 */
router.post('/', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const { name, email, dob } = req.body;
    const { user, tempPassword } = createUserAccount({ role: 'patient', name, email, dob });
    res.status(201).json({
      message: `${user.name} registered and ready. Temporary password shown once below.`,
      user,
      temp_password: tempPassword,
      handoff_message: `Welcome, ${user.name}! Sign in at MedBridge with ${user.email} and the temporary password from your doctor — change it after your first sign-in.`
    });
  } catch (error) {
    if (error instanceof AccountValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error quick-adding patient:', error);
    res.status(500).json({ error: 'Failed to register walk-in patient' });
  }
});

// GET /patients - List patients (for Doctor's patient picker)
// Enriched with lightweight symptom-journal activity so the clinician sees
// who has been logging (and how rough the latest entry was) at a glance.
router.get('/', authenticateToken, (req, res) => {
  try {
    const patients = db.prepare(`
      SELECT id, name, email, role, dob, gender, phone, created_at
      FROM users
      WHERE role = 'patient'
      ORDER BY name ASC
    `).all();

    const activeStmt = db.prepare(`
      SELECT value, unit, log_date
      FROM self_logs
      WHERE patient_id = ? AND log_type = 'symptom' AND entry_id IS NOT NULL
      ORDER BY log_date DESC, created_at DESC
      LIMIT 5
    `);
    const countStmt = db.prepare(
      'SELECT COUNT(DISTINCT entry_id) AS n FROM self_logs WHERE patient_id = ? AND log_type = ? AND entry_id IS NOT NULL'
    );

    for (const p of patients) {
      p.entry_count = countStmt.get(p.id, 'symptom').n;
      const recent = activeStmt.all(p.id);
      if (recent.length === 0) {
        p.symptom_activity = null;
        continue;
      }
      const norm = (v, u) => ((u || '') === '/10' ? (parseFloat(v) || 0) / 2 : parseFloat(v) || 0);
      const maxSev = Math.max(...recent.map(r => norm(r.value, r.unit)));
      p.symptom_activity = {
        log_date: recent[0].log_date,
        log_count: recent.length,
        max_severity: Math.round(maxSev * 10) / 10
      };
    }

    res.json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to retrieve patients' });
  }
});

// GET /patients/:id/history - Full history for Doctor view (and Patient history view)
router.get('/:id/history', authenticateToken, (req, res) => {
  try {
    const patientId = req.params.id;

    // Verify patient exists
    const patient = db.prepare(`
      SELECT id, name, email, role, created_at
      FROM users
      WHERE id = ? AND role = 'patient'
    `).get(patientId);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // 1. Fetch visits with diagnosis and doctor info
    const visits = db.prepare(`
      SELECT v.id, v.visit_date, v.notes, v.created_at,
             d.id as diagnosis_id, d.name as diagnosis_name, d.description as diagnosis_desc,
             d.symptoms as diagnosis_symptoms, d.precautions as diagnosis_precautions,
             doc.name as doctor_name, doc.specialization as doctor_specialization
      FROM visits v
      JOIN diagnoses d ON v.diagnosis_id = d.id
      JOIN users doc ON v.doctor_id = doc.id
      WHERE v.patient_id = ?
      ORDER BY v.visit_date DESC, v.created_at DESC
    `).all(patientId);

    // 2. Fetch prescriptions and lab orders for these visits
    for (const visit of visits) {
      visit.prescriptions = db.prepare(`
        SELECT p.id, p.dosage, p.duration,
               m.id as medicine_id, m.name as medicine_name, m.composition,
               m.therapeutic_class, m.side_effects,
               COALESCE(m.uses_ai_generated, m.uses_static) as plain_explanation
        FROM prescriptions p
        JOIN medicines m ON p.medicine_id = m.id
        WHERE p.visit_id = ?
        ORDER BY m.name ASC
      `).all(visit.id);

      visit.lab_orders = db.prepare(`
        SELECT id, test_name, scheduled_date, status
        FROM lab_orders
        WHERE visit_id = ?
        ORDER BY scheduled_date ASC
      `).all(visit.id);
    }

    // 3. Fetch all appointments (status + time included for patient/doctor views)
    const appointments = db.prepare(`
      SELECT a.id, a.appointment_date, a.appointment_time, a.reason, a.status,
             a.proposed_date, a.proposed_time, a.proposed_reason,
             doc.name as doctor_name
      FROM appointments a
      JOIN users doc ON a.doctor_id = doc.id
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC
    `).all(patientId);

    // 4. Fetch patient self-logs (vitals & symptoms, with entry grouping fields)
    const selfLogs = db.prepare(`
      SELECT s.id, s.log_type, s.label, s.value, s.unit, s.log_date, s.created_at,
             s.entry_id, s.duration, s.notes,
             lt.normal_low, lt.normal_high
      FROM self_logs s
      LEFT JOIN lab_tests lt ON s.label = lt.test_name
      WHERE s.patient_id = ?
      ORDER BY s.log_date DESC, s.created_at DESC
    `).all(patientId);

    // 5. Doctor guidance threads on symptom journal entries, keyed by entry_id
    const comments = db.prepare(`
      SELECT c.id, c.entry_id, c.comment, c.created_at, doc.name AS doctor_name,
             doc.specialization AS doctor_specialization
      FROM symptom_comments c
      JOIN users doc ON c.doctor_id = doc.id
      WHERE c.patient_id = ?
      ORDER BY c.created_at DESC
    `).all(patientId);
    const commentsByEntry = {};
    for (const c of comments) {
      if (!commentsByEntry[c.entry_id]) commentsByEntry[c.entry_id] = [];
      commentsByEntry[c.entry_id].push(c);
    }

    res.json({
      patient,
      visits,
      appointments,
      self_logs: selfLogs,
      symptom_comments: comments,
      symptom_comments_by_entry: commentsByEntry
    });
  } catch (error) {
    console.error('Error fetching patient history:', error);
    res.status(500).json({ error: 'Failed to retrieve patient medical history' });
  }
});

// GET /patients/:id/dashboard - Patient Home View
router.get('/:id/dashboard', authenticateToken, (req, res) => {
  try {
    const patientId = req.params.id;

    // 1. Next appointment: earliest non-cancelled upcoming appointment (any status),
    // falling back to the most recent past one
    const today = require('../utils/scheduling').localDateStr();
    let nextAppointment = db.prepare(`
      SELECT a.id, a.appointment_date, a.reason, a.status, doc.name as doctor_name, doc.specialization
      FROM appointments a
      JOIN users doc ON a.doctor_id = doc.id
      WHERE a.patient_id = ? AND a.appointment_date >= ? AND a.status != 'cancelled'
      ORDER BY a.appointment_date ASC
      LIMIT 1
    `).get(patientId, today);

    if (!nextAppointment) {
      nextAppointment = db.prepare(`
        SELECT a.id, a.appointment_date, a.reason, a.status, doc.name as doctor_name, doc.specialization
        FROM appointments a
        JOIN users doc ON a.doctor_id = doc.id
        WHERE a.patient_id = ?
        ORDER BY a.appointment_date DESC
        LIMIT 1
      `).get(patientId);
    }

    // If none found in future, grab the latest appointment
    if (!nextAppointment) {
      nextAppointment = db.prepare(`
        SELECT a.id, a.appointment_date, a.reason, doc.name as doctor_name, doc.specialization
        FROM appointments a
        JOIN users doc ON a.doctor_id = doc.id
        WHERE a.patient_id = ?
        ORDER BY a.appointment_date DESC
        LIMIT 1
      `).get(patientId);
    }

    // 2. Pending / Scheduled lab tests
    const pendingLabs = db.prepare(`
      SELECT lo.id, lo.test_name, lo.scheduled_date, lo.status,
             lt.unit, lt.normal_low, lt.normal_high
      FROM lab_orders lo
      JOIN visits v ON lo.visit_id = v.id
      LEFT JOIN lab_tests lt ON lo.test_name = lt.test_name
      WHERE v.patient_id = ? AND lo.status = 'pending'
      ORDER BY lo.scheduled_date ASC
    `).all(patientId);

    // 3. Currently active medicines from latest visits
    // We group by medicine to provide a clean active regimen
    const activeMedicines = db.prepare(`
      SELECT m.id, m.name, m.composition, m.side_effects, m.therapeutic_class,
             COALESCE(m.uses_ai_generated, m.uses_static) as plain_explanation,
             m.uses_static,
             p.dosage, p.duration, v.visit_date
      FROM prescriptions p
      JOIN visits v ON p.visit_id = v.id
      JOIN medicines m ON p.medicine_id = m.id
      WHERE v.patient_id = ?
        AND v.id = (
          SELECT id FROM visits
          WHERE patient_id = ?
          ORDER BY visit_date DESC, created_at DESC
          LIMIT 1
        )
      ORDER BY m.name ASC
    `).all(patientId, patientId);

    // 4. Recent vitals for quick glance (entry_id included to link fever temps)
    const recentVitals = db.prepare(`
      SELECT s.id, s.label, s.value, s.unit, s.log_date, s.entry_id,
             lt.normal_low, lt.normal_high
      FROM self_logs s
      LEFT JOIN lab_tests lt ON s.label = lt.test_name
      WHERE s.patient_id = ? AND s.log_type = 'vital'
      ORDER BY s.log_date DESC, s.created_at DESC
      LIMIT 6
    `).all(patientId);

    res.json({
      next_appointment: nextAppointment || null,
      pending_labs: pendingLabs,
      active_medicines: activeMedicines,
      recent_vitals: recentVitals
    });
  } catch (error) {
    console.error('Error fetching patient dashboard:', error);
    res.status(500).json({ error: 'Failed to retrieve patient dashboard data' });
  }
});

// GET /patients/:id/self-logs - Time-series trend data joined with lab_tests reference ranges
router.get('/:id/self-logs', authenticateToken, (req, res) => {
  try {
    const patientId = req.params.id;
    const { type, label } = req.query;

    let query = `
      SELECT s.id, s.patient_id, s.log_type, s.label, s.value, s.unit, s.log_date, s.created_at,
             s.entry_id, s.duration, s.notes,
             lt.normal_low, lt.normal_high
      FROM self_logs s
      LEFT JOIN lab_tests lt ON s.label = lt.test_name
      WHERE s.patient_id = ?
    `;
    const params = [patientId];

    if (type) {
      query += ' AND s.log_type = ?';
      params.push(type);
    }
    if (label) {
      query += ' AND s.label = ?';
      params.push(label);
    }

    query += ' ORDER BY s.log_date ASC, s.created_at ASC';

    const logs = db.prepare(query).all(...params);

    // Also return lab test reference info if label is provided
    let referenceInfo = null;
    if (label) {
      referenceInfo = db.prepare(`
        SELECT id, test_name, unit, normal_low, normal_high
        FROM lab_tests
        WHERE test_name = ?
      `).get(label);
    }

    res.json({
      logs,
      reference: referenceInfo || null
    });
  } catch (error) {
    console.error('Error fetching self logs:', error);
    res.status(500).json({ error: 'Failed to retrieve self logs' });
  }
});

module.exports = router;
