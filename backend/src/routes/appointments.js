const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getDaySlots, validateSlot, localDateStr } = require('../utils/scheduling');
const { emit, adminIds } = require('../utils/events');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /appointments/availability?doctor_id=&date= — Round 2 Phases 52–56.
 * Returns the full working day's slots as [{ time, available }] so the
 * frontend never does slot math. Past times (today, server clock) and
 * occupied slots come back pre-marked.
 */
router.get('/availability', authenticateToken, (req, res) => {
  try {
    // Patients fetch it to book; doctors fetch it for the Propose-Reschedule
    // slot grid (same component, Phase 147). Admins do not need it.
    if (!['patient', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Role patient or doctor required.' });
    }
    const { doctor_id, date } = req.query;

    if (!doctor_id || !DATE_RE.test(String(date || ''))) {
      return res.status(400).json({ error: 'doctor_id and a YYYY-MM-DD date are required' });
    }

    const doctor = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'doctor'").get(doctor_id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const day = getDaySlots(doctor_id, String(date));
    res.json({
      doctor_id,
      date,
      weekday: day.weekday,
      slot_duration_minutes: require('../config').SLOT_DURATION_MINUTES,
      has_hours: day.availability_found,
      slots: day.slots
    });
  } catch (error) {
    console.error('Error computing availability:', error);
    res.status(500).json({ error: 'Failed to compute availability' });
  }
});

/**
 * GET /appointments/mine — patient's own appointments (all statuses, newest first).
 * Round 2 Phase 59: includes time + reschedule proposal fields.
 */
router.get('/mine', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const appointments = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.appointment_time,
             a.reason, a.status, a.proposed_date, a.proposed_time, a.proposed_reason, a.created_at,
             doc.name AS doctor_name, doc.specialization AS doctor_specialization
      FROM appointments a
      JOIN users doc ON a.doctor_id = doc.id
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.created_at DESC
    `).all(req.user.id);

    res.json(appointments);
  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    res.status(500).json({ error: 'Failed to retrieve appointments' });
  }
});

/**
 * GET /appointments/pending — doctor's pending requests (Phase 59 enrichment).
 */
router.get('/pending', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.appointment_time,
             a.reason, a.status, a.proposed_date, a.proposed_time, a.proposed_reason, a.created_at,
             pat.name AS patient_name, pat.email AS patient_email
      FROM appointments a
      JOIN users pat ON a.patient_id = pat.id
      WHERE a.doctor_id = ? AND a.status = 'requested'
      ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.created_at ASC
    `).all(req.user.id);

    res.json(requests);
  } catch (error) {
    console.error('Error fetching pending appointment requests:', error);
    res.status(500).json({ error: 'Failed to retrieve appointment requests' });
  }
});

/**
 * GET /appointments/doctor/day?date= — Round 2 Phase 65: the doctor's Day View.
 * Ordered list of that day's booked slots (any non-cancelled status), plus
 * reschedule proposals pointing into that day.
 */
router.get('/doctor/day', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const date = String(req.query.date || '');
    if (!DATE_RE.test(date)) {
      return res.status(400).json({ error: 'A YYYY-MM-DD date is required' });
    }

    const booked = db.prepare(`
      SELECT a.id, a.patient_id, a.appointment_date, a.appointment_time, a.reason, a.status,
             a.proposed_date, a.proposed_time, a.proposed_reason,
             pat.name AS patient_name, pat.email AS patient_email
      FROM appointments a
      JOIN users pat ON a.patient_id = pat.id
      WHERE a.doctor_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'
      ORDER BY a.appointment_time ASC
    `).all(req.user.id, date);

    // Proposals offered INTO this day (the tentatively-held new slots)
    const incoming = db.prepare(`
      SELECT a.id, a.patient_id, a.proposed_date, a.proposed_time, a.proposed_reason, a.status,
             pat.name AS patient_name
      FROM appointments a
      JOIN users pat ON a.patient_id = pat.id
      WHERE a.doctor_id = ? AND a.status = 'reschedule_proposed' AND a.proposed_date = ?
      ORDER BY a.proposed_time ASC
    `).all(req.user.id, date);

    res.json({ date, booked, incoming_proposals: incoming });
  } catch (error) {
    console.error('Error fetching doctor day view:', error);
    res.status(500).json({ error: 'Failed to load day view' });
  }
});

/**
 * POST /appointments — patient books with a real time slot (Round 2 Phase 57).
 * The slot is re-validated server-side at write time; a lost race returns a
 * specific, friendly 409 (Phase 58) instead of a generic error.
 * Body: { doctor_id, appointment_date, appointment_time, reason? }
 */
router.post('/', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const { doctor_id, appointment_date, appointment_time, reason } = req.body;
    const patientId = req.user.id;

    if (!doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        error: 'doctor_id, appointment_date, and appointment_time are required — pick a time slot'
      });
    }

    if (!DATE_RE.test(appointment_date)) {
      return res.status(400).json({ error: 'appointment_date must be in YYYY-MM-DD format' });
    }

    const doctor = db.prepare(`
      SELECT id, name, specialization FROM users WHERE id = ? AND role = 'doctor' AND is_active = 1
    `).get(doctor_id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Server-side slot re-validation — closes the fetch/submit race window.
    const verdict = validateSlot(doctor_id, appointment_date, appointment_time);
    if (!verdict.ok) {
      const messages = {
        format_date: 'That date does not look right — please pick a valid date.',
        format_time: 'That time does not look right — please pick a slot from the grid.',
        past_date: 'That date is in the past — please choose an upcoming day.',
        past_time_today: 'That time has already passed today — please pick a later slot.',
        off_schedule: 'Dr. ' + doctor.name.replace(/^Dr\.?\s*/i, '') + ' is not seeing patients at that time — pick a slot from the grid.',
        taken: 'That time was just booked — pick another slot.'
      };
      return res.status(verdict.reason === 'taken' ? 409 : 400).json({
        error: messages[verdict.reason] || 'That slot is not available — please pick another.'
      });
    }

    const appointmentId = `apt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, appointment_time, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, 'requested')
    `).run(
      appointmentId,
      patientId,
      doctor_id,
      appointment_date,
      appointment_time,
      reason ? String(reason).trim() : null
    );

    const created = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.appointment_time,
             a.reason, a.status, a.created_at,
             doc.name AS doctor_name, doc.specialization AS doctor_specialization
      FROM appointments a
      JOIN users doc ON a.doctor_id = doc.id
      WHERE a.id = ?
    `).get(appointmentId);

    res.status(201).json({
      message: 'Appointment requested. Your doctor will confirm shortly.',
      appointment: created
    });

    // P26: appointment.requested → that doctor, admins, the patient's OTHER tabs
    // (same user id — their other connections get it; this tab refetches anyway).
    emit({
      type: 'appointment.requested',
      ids: [doctor_id, patientId, ...adminIds()],
      actor_name: req.user.name,
      summary: `${req.user.name} requested an appointment with Dr. ${doctor.name.replace(/^Dr\.?\s*/i, '')}`,
      appointment_id: appointmentId,
      doctor_id,
      patient_id: patientId,
      date: appointment_date,
      time: appointment_time
    });
  } catch (error) {
    console.error('Error creating appointment request:', error);
    res.status(500).json({ error: 'Failed to create appointment request' });
  }
});

/**
 * PATCH /appointments/:id/cancel — P21: a patient cancels their OWN
 * requested/confirmed appointment (no way to cancel existed before). A row
 * with an open reschedule proposal must be answered via respond-reschedule
 * instead (accept/decline), so 'reschedule_proposed' is rejected here.
 */
router.patch('/:id/cancel', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (appointment.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only cancel your own appointments' });
    }

    if (!['requested', 'confirmed'].includes(appointment.status)) {
      return res.status(409).json({
        error: appointment.status === 'reschedule_proposed'
          ? 'A reschedule proposal is open — accept or decline it instead'
          : `This appointment is already ${appointment.status}`
      });
    }

    db.prepare(`
      UPDATE appointments
      SET status = 'cancelled', proposed_date = NULL, proposed_time = NULL, proposed_reason = NULL
      WHERE id = ?
    `).run(appointment.id);

    const updated = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.appointment_time,
             a.reason, a.status, doc.name AS doctor_name
      FROM appointments a JOIN users doc ON a.doctor_id = doc.id
      WHERE a.id = ?
    `).get(appointment.id);

    res.json({ message: 'Appointment cancelled — the time slot has been released.', appointment: updated });

    // P26: patient-initiated cancellation.
    emit({
      type: 'appointment.updated',
      ids: [updated.doctor_id, updated.patient_id, ...adminIds()],
      actor_name: req.user.name,
      summary: `${req.user.name} cancelled their appointment`,
      appointment_id: appointment.id,
      doctor_id: updated.doctor_id,
      patient_id: updated.patient_id,
      status: 'cancelled'
    });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

/**
 * PATCH /appointments/:id/status — doctor confirms or declines a request.
 * Round-1 behavior preserved unchanged (Phase 66); also allows cancelling a
 * reschedule_proposed row outright (doctor withdrew / moved on).
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

    // A doctor must always be able to withdraw an appointment addressed to them,
    // including one that is already 'confirmed'. Without this, a follow-up created
    // by POST /visits permanently burned a real slot with no release path at all —
    // the patient could cancel, but the doctor could not. Confirming stays limited
    // to rows still awaiting the doctor's answer.
    const canCancel = ['requested', 'reschedule_proposed', 'confirmed'].includes(appointment.status);
    const canConfirm = appointment.status === 'requested';
    if (status === 'cancelled' ? !canCancel : !canConfirm) {
      return res.status(409).json({
        error: `This request has already been ${appointment.status} and can no longer be changed`
      });
    }

    if (status === 'confirmed' && appointment.status === 'reschedule_proposed') {
      return res.status(409).json({
        error: 'A reschedule proposal is open on this appointment — the patient must accept or decline it first'
      });
    }

    db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, appointmentId);

    const updated = db.prepare(`
      SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.appointment_time,
             a.reason, a.status, a.created_at,
             pat.name AS patient_name, pat.email AS patient_email
      FROM appointments a
      JOIN users pat ON a.patient_id = pat.id
      WHERE a.id = ?
    `).get(appointmentId);

    res.json({ message: `Appointment ${status}`, appointment: updated });

    // P26: appointment.updated → doctor + patient + admins
    emit({
      type: 'appointment.updated',
      ids: [updated.doctor_id, updated.patient_id, ...adminIds()],
      actor_name: req.user.name,
      summary: status === 'confirmed'
        ? `Dr. ${req.user.name.replace(/^Dr\.?\s*/i, '')} confirmed ${updated.patient_name}'s appointment`
        : `Dr. ${req.user.name.replace(/^Dr\.?\s*/i, '')} declined ${updated.patient_name}'s appointment request`,
      appointment_id: appointmentId,
      doctor_id: updated.doctor_id,
      patient_id: updated.patient_id,
      status
    });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ error: 'Failed to update appointment status' });
  }
});

/**
 * PATCH /appointments/:id/propose-reschedule — Round 2 Phases 60–61.
 * Doctor picks a new slot from the same availability engine; the row moves to
 * reschedule_proposed with the original date/time intact (both slots held).
 * Allowed from 'requested' (counter-offer) and 'confirmed' (move a booked visit).
 */
router.patch('/:id/propose-reschedule', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const { proposed_date, proposed_time, proposed_reason } = req.body;
    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    if (appointment.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only reschedule your own appointments' });
    }
    if (!['requested', 'confirmed'].includes(appointment.status)) {
      return res.status(409).json({
        error: `This appointment is ${appointment.status} — only requested or confirmed visits can be rescheduled`
      });
    }

    if (!proposed_date || !proposed_time) {
      return res.status(400).json({ error: 'proposed_date and proposed_time are required' });
    }

    // The row's own original slot must not block its own proposal options.
    const verdict = validateSlot(appointment.doctor_id, proposed_date, proposed_time, {
      excludeAppointmentId: appointment.id
    });
    if (!verdict.ok) {
      const messages = {
        format_date: 'Pick a valid date for the new time.',
        format_time: 'Pick a valid time for the new appointment.',
        past_date: 'The new date is in the past — pick an upcoming day.',
        past_time_today: 'That time has already passed today — pick a later slot.',
        off_schedule: 'You are not scheduled to see patients at that time — pick a slot from the grid.',
        taken: 'That slot is already taken — pick another from the grid.'
      };
      return res.status(verdict.reason === 'taken' ? 409 : 400).json({
        error: messages[verdict.reason] || 'That slot is not available — pick another.'
      });
    }

    db.prepare(`
      UPDATE appointments
      SET status = 'reschedule_proposed', proposed_date = ?, proposed_time = ?, proposed_reason = ?
      WHERE id = ?
    `).run(
      proposed_date,
      proposed_time,
      proposed_reason ? String(proposed_reason).trim() : null,
      appointment.id
    );

    const updated = db.prepare(`
      SELECT a.*, pat.name AS patient_name, pat.email AS patient_email
      FROM appointments a JOIN users pat ON a.patient_id = pat.id
      WHERE a.id = ?
    `).get(appointment.id);

    res.json({
      message: 'Reschedule proposed — the patient will see both times and can accept or decline.',
      appointment: updated
    });

    // P26: a reschedule proposal also updates the appointment row.
    emit({
      type: 'appointment.updated',
      ids: [updated.doctor_id, updated.patient_id, ...adminIds()],
      actor_name: req.user.name,
      summary: `Dr. ${req.user.name.replace(/^Dr\.?\s*/i, '')} proposed a new time to ${updated.patient_name}`,
      appointment_id: appointment.id,
      doctor_id: updated.doctor_id,
      patient_id: updated.patient_id,
      status: 'reschedule_proposed'
    });
  } catch (error) {
    console.error('Error proposing reschedule:', error);
    res.status(500).json({ error: 'Failed to propose reschedule' });
  }
});

/**
 * PATCH /appointments/:id/respond-reschedule — Round 2 Phases 62–64.
 * Patient-only. Accept: proposed fields copied into the live fields, status →
 * confirmed. Decline: proposed fields cleared, status → cancelled (slots freed).
 */
router.patch('/:id/respond-reschedule', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const { accept } = req.body;
    if (typeof accept !== 'boolean') {
      return res.status(400).json({ error: 'accept must be true or false' });
    }

    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (appointment.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the patient who owns this appointment can respond' });
    }

    // Phase 64: a proposal that already moved on (doctor cancelled meanwhile)
    // gets a clear 409, not a silent no-op.
    if (appointment.status === 'reschedule_proposed' &&
        appointment.proposed_date === null && appointment.proposed_time === null) {
      return res.status(409).json({ error: 'This reschedule proposal is no longer open' });
    }
    if (appointment.status !== 'reschedule_proposed') {
      return res.status(409).json({
        error: appointment.status === 'cancelled'
          ? 'This appointment was cancelled — the reschedule no longer applies'
          : 'No reschedule is currently proposed on this appointment'
      });
    }

    if (accept) {
      db.prepare(`
        UPDATE appointments
        SET appointment_date = proposed_date, appointment_time = proposed_time,
            status = 'confirmed', proposed_date = NULL, proposed_time = NULL, proposed_reason = NULL
        WHERE id = ?
      `).run(appointment.id);
    } else {
      db.prepare(`
        UPDATE appointments
        SET status = 'cancelled', proposed_date = NULL, proposed_time = NULL, proposed_reason = NULL
        WHERE id = ?
      `).run(appointment.id);
    }

    const updated = db.prepare(`
      SELECT a.*, doc.name AS doctor_name, doc.specialization AS doctor_specialization
      FROM appointments a JOIN users doc ON a.doctor_id = doc.id
      WHERE a.id = ?
    `).get(appointment.id);

    res.json({
      message: accept
        ? 'Reschedule accepted — your appointment is confirmed at the new time.'
        : 'Reschedule declined — the appointment is cancelled and the original time released.',
      appointment: updated
    });

    // P26: patient accept/decline of a proposal.
    emit({
      type: 'appointment.updated',
      ids: [updated.doctor_id, updated.patient_id, ...adminIds()],
      actor_name: req.user.name,
      summary: accept
        ? `${req.user.name} accepted the proposed time`
        : `${req.user.name} declined the proposed time`,
      appointment_id: appointment.id,
      doctor_id: updated.doctor_id,
      patient_id: updated.patient_id,
      status: updated.status
    });
  } catch (error) {
    console.error('Error responding to reschedule:', error);
    res.status(500).json({ error: 'Failed to respond to reschedule' });
  }
});

module.exports = router;
