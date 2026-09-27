const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * GET /appointments/mine — patient's own appointments (all statuses, newest first).
 */
router.get('/mine', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const appointments = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status, a.created_at,
             doc.name AS doctor_name, doc.specialization AS doctor_specialization
      FROM appointments a
      JOIN users doc ON a.doctor_id = doc.id
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC, a.created_at DESC
    `).all(req.user.id);

    res.json(appointments);
  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    res.status(500).json({ error: 'Failed to retrieve appointments' });
  }
});

/**
 * GET /appointments/pending — doctor's pending requests (patient names included).
 */
router.get('/pending', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status, a.created_at,
             pat.name AS patient_name, pat.email AS patient_email
      FROM appointments a
      JOIN users pat ON a.patient_id = pat.id
      WHERE a.doctor_id = ? AND a.status = 'requested'
      ORDER BY a.appointment_date ASC, a.created_at ASC
    `).all(req.user.id);

    res.json(requests);
  } catch (error) {
    console.error('Error fetching pending appointment requests:', error);
    res.status(500).json({ error: 'Failed to retrieve appointment requests' });
  }
});

/**
 * POST /appointments — patient books a new appointment request.
 * Body: { doctor_id, appointment_date, reason }
 */
router.post('/', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const { doctor_id, appointment_date, reason } = req.body;
    const patientId = req.user.id;

    if (!doctor_id || !appointment_date) {
      return res.status(400).json({ error: 'doctor_id and appointment_date are required' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
      return res.status(400).json({ error: 'appointment_date must be in YYYY-MM-DD format' });
    }

    if (appointment_date < todayStr()) {
      return res.status(400).json({ error: 'appointment_date cannot be in the past' });
    }

    const doctor = db.prepare(`
      SELECT id, name, specialization FROM users WHERE id = ? AND role = 'doctor'
    `).get(doctor_id);

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const appointmentId = `apt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, reason, status)
      VALUES (?, ?, ?, ?, ?, 'requested')
    `).run(
      appointmentId,
      patientId,
      doctor_id,
      appointment_date,
      reason ? String(reason).trim() : null
    );

    const created = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status, a.created_at,
             doc.name AS doctor_name, doc.specialization AS doctor_specialization
      FROM appointments a
      JOIN users doc ON a.doctor_id = doc.id
      WHERE a.id = ?
    `).get(appointmentId);

    res.status(201).json({
      message: 'Appointment requested. Your doctor will confirm shortly.',
      appointment: created
    });
  } catch (error) {
    console.error('Error creating appointment request:', error);
    res.status(500).json({ error: 'Failed to create appointment request' });
  }
});

/**
 * PATCH /appointments/:id/status — doctor confirms or declines a request.
 * Body: { status: 'confirmed' | 'cancelled' }
 * Only 'requested' rows can transition (idempotent-safe; no un-cancelling).
 */
router.patch('/:id/status', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const { status } = req.body;
    const appointmentId = req.params.id;

    if (!['confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'status must be "confirmed" or "cancelled"' });
    }

    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only manage appointment requests addressed to you' });
    }

    if (appointment.status !== 'requested') {
      return res.status(409).json({
        error: `This request has already been ${appointment.status} and can no longer be changed`
      });
    }

    db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, appointmentId);

    const updated = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.reason, a.status, a.created_at,
             pat.name AS patient_name, pat.email AS patient_email
      FROM appointments a
      JOIN users pat ON a.patient_id = pat.id
      WHERE a.id = ?
    `).get(appointmentId);

    res.json({ message: `Appointment ${status}`, appointment: updated });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ error: 'Failed to update appointment status' });
  }
});

module.exports = router;
