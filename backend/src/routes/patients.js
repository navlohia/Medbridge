const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// GET /doctors route lives in routes/doctors.js (mounted at /doctors)

// GET /patients - List patients (for Doctor's patient picker)
router.get('/', authenticateToken, (req, res) => {
  try {
    const patients = db.prepare(`
      SELECT id, name, email, role, created_at
      FROM users
      WHERE role = 'patient'
      ORDER BY name ASC
    `).all();

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

    // 3. Fetch all appointments (status included for patient/doctor views)
    const appointments = db.prepare(`
      SELECT a.id, a.appointment_date, a.reason, a.status, doc.name as doctor_name
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

    res.json({
      patient,
      visits,
      appointments,
      self_logs: selfLogs
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
    const today = new Date().toISOString().split('T')[0];
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
