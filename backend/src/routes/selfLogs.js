const express = require('express');
const { emit, doctorIds } = require('../utils/events');
const router = express.Router();
const { db, transaction } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { autoCompleteLabOrders } = require('../utils/labOrders');

const VALID_DURATIONS = ['Today', '2-3 days', 'A week+', 'Custom'];

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function todayStr() {
  return require('../utils/scheduling').localDateStr();
}

function fetchEntry(entryId, patientId) {
  const rows = db.prepare(`
    SELECT s.id, s.patient_id, s.log_type, s.label, s.value, s.unit, s.log_date,
           s.entry_id, s.duration, s.notes, s.created_at,
           lt.normal_low, lt.normal_high
    FROM self_logs s
    LEFT JOIN lab_tests lt ON s.label = lt.test_name
    WHERE s.entry_id = ? AND s.patient_id = ?
    ORDER BY s.created_at ASC
  `).all(entryId, patientId);

  if (rows.length === 0) return null;

  return {
    entry_id: entryId,
    log_date: rows[0].log_date,
    duration: rows[0].duration,
    notes: rows[0].notes,
    symptoms: rows
      .filter(r => r.log_type === 'symptom')
      .map(r => ({ id: r.id, label: r.label, severity: parseInt(r.value, 10), unit: r.unit })),
    vitals: rows
      .filter(r => r.log_type === 'vital')
      .map(r => ({ id: r.id, label: r.label, value: r.value, unit: r.unit, normal_low: r.normal_low, normal_high: r.normal_high }))
  };
}

/**
 * POST /self-logs/entry — Feature Spec 2: multi-symptom entry.
 * Body: {
 *   entry_date?: 'YYYY-MM-DD',
 *   duration: 'Today' | '2-3 days' | 'A week+',
 *   notes?: string,
 *   symptoms: [{ label: string, severity: 1-5 }],
 *   fever_temperature?: number   // required context-free; stored as a vital row
 * }
 * All rows share one entry_id and are written in a single transaction.
 */
router.post('/entry', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const { entry_date, duration, notes, symptoms, fever_temperature } = req.body;
    const patientId = req.user.id;

    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({ error: 'At least one symptom is required' });
    }
    if (symptoms.length > 12) {
      return res.status(400).json({ error: 'A maximum of 12 symptoms per entry is allowed' });
    }
    if (!duration || !VALID_DURATIONS.includes(duration)) {
      return res.status(400).json({ error: 'duration must be one of: ' + VALID_DURATIONS.join(', ') });
    }

    const cleanSymptoms = [];
    for (const s of symptoms) {
      if (!s || typeof s.label !== 'string' || !s.label.trim()) {
        return res.status(400).json({ error: 'Each symptom needs a label' });
      }
      const severity = parseInt(s.severity, 10);
      if (isNaN(severity) || severity < 1 || severity > 5) {
        return res.status(400).json({ error: 'Each symptom needs a severity between 1 and 5' });
      }
      cleanSymptoms.push({ label: s.label.trim(), severity });
    }

    const hasFever = cleanSymptoms.some(s => s.label.toLowerCase().includes('fever'));
    let temperature = null;
    if (fever_temperature !== undefined && fever_temperature !== null && fever_temperature !== '') {
      const t = parseFloat(fever_temperature);
      if (isNaN(t) || t < 90 || t > 110) {
        return res.status(400).json({ error: 'Temperature must be a numeric value between 90 and 110 °F' });
      }
      if (!hasFever) {
        return res.status(400).json({ error: 'Temperature can only be logged when Fever is among the selected symptoms' });
      }
      temperature = t;
    }

    const effectiveDate = entry_date || todayStr();
    const entryId = genId('entry');
    let completedLabOrders = [];

    transaction((database) => {
      const insertLog = database.prepare(`
        INSERT INTO self_logs (id, patient_id, log_type, label, value, unit, log_date, entry_id, duration, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const s of cleanSymptoms) {
        insertLog.run(
          genId('log'), patientId, 'symptom', s.label, String(s.severity), '/5',
          effectiveDate, entryId, duration, notes ? String(notes).trim() : null
        );
      }

      if (temperature !== null) {
        insertLog.run(
          genId('log'), patientId, 'vital', 'Body Temperature', String(temperature), '°F',
          effectiveDate, entryId, duration, notes ? String(notes).trim() : null
        );
        completedLabOrders = autoCompleteLabOrders(database, patientId, 'Body Temperature', effectiveDate);
      }
    });

    res.status(201).json({
      message: `Logged ${cleanSymptoms.length} symptom${cleanSymptoms.length > 1 ? 's' : ''} successfully`,
      entry: fetchEntry(entryId, patientId),
      completed_lab_orders: completedLabOrders
    });

    // P27: selflog.created → all doctors (the journal is the doctors' intake queue).
    const patientName = db.prepare('SELECT name FROM users WHERE id = ?').get(patientId)?.name || 'A patient';
    const topSymptom = cleanSymptoms.reduce((a, b) => (b.severity > a.severity ? b : a));
    emit({
      type: 'selflog.created',
      ids: doctorIds(),
      actor_name: req.user.name,
      summary: `${patientName} logged ${cleanSymptoms.length} symptom${cleanSymptoms.length > 1 ? 's' : ''} (worst: ${topSymptom.label} ${topSymptom.severity}/5)`,
      patient_id: patientId,
      entry_id: entryId
    });
  } catch (error) {
    console.error('Error recording symptom entry:', error);
    res.status(500).json({ error: 'Failed to record symptom entry' });
  }
});

/**
 * POST /self-logs — single log (vitals logger; kept for backward compatibility).
 */
router.post('/', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const { log_type, label, value, unit, log_date } = req.body;
    const patientId = req.user.id;

    if (!log_type || !label || value === undefined || value === null || value === '') {
      return res.status(400).json({ error: 'log_type, label, and value are required' });
    }

    if (!['symptom', 'vital'].includes(log_type)) {
      return res.status(400).json({ error: 'log_type must be either "symptom" or "vital"' });
    }

    const logId = genId('log');
    const effectiveDate = log_date || todayStr();
    let completedLabOrders = [];

    transaction((database) => {
      database.prepare(`
        INSERT INTO self_logs (id, patient_id, log_type, label, value, unit, log_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, patientId, log_type, label.trim(), String(value).trim(), unit ? unit.trim() : null, effectiveDate);

      if (log_type === 'vital') {
        completedLabOrders = autoCompleteLabOrders(database, patientId, label.trim(), effectiveDate);
      }
    });

    const savedLog = db.prepare(`
      SELECT s.id, s.patient_id, s.log_type, s.label, s.value, s.unit, s.log_date, s.created_at,
             s.entry_id, s.duration, s.notes, lt.normal_low, lt.normal_high
      FROM self_logs s
      LEFT JOIN lab_tests lt ON s.label = lt.test_name
      WHERE s.id = ?
    `).get(logId);

    res.status(201).json({
      message: `${log_type === 'vital' ? 'Vital reading' : 'Symptom'} logged successfully`,
      log: savedLog,
      completed_lab_orders: completedLabOrders
    });

    // P27: single self-logs (vitals + legacy symptom rows) also notify doctors.
    const patientName = db.prepare('SELECT name FROM users WHERE id = ?').get(patientId)?.name || 'A patient';
    emit({
      type: 'selflog.created',
      ids: doctorIds(),
      actor_name: req.user.name,
      summary: `${patientName} logged ${label.trim()} ${String(value).trim()}${unit ? ' ' + unit.trim() : ''}`,
      patient_id: patientId,
      log_id: logId
    });
  } catch (error) {
    console.error('Error recording self-log:', error);
    res.status(500).json({ error: 'Failed to record self-log entry' });
  }
});

/**
 * POST /self-logs/entry/:entryId/comment — Post-Pass 3: doctor guidance on a
 * patient's symptom journal entry. Legacy single-log entries arrive as
 * "solo_<logId>" (the client's synthetic grouping key); on first reply we
 * materialize a real entry_id for that row so the thread persists.
 */
router.post('/entry/:entryId/comment', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const { entryId } = req.params;
    const { comment } = req.body;
    const doctorId = req.user.id;

    const text = typeof comment === 'string' ? comment.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    if (text.length > 2000) {
      return res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });
    }

    let effectiveEntryId = entryId;
    let patientId;

    if (entryId.startsWith('solo_')) {
      // Legacy singleton row: materialize its entry_id on first guidance
      const logRow = db.prepare('SELECT id, patient_id, entry_id FROM self_logs WHERE id = ?').get(entryId.slice(5));
      if (!logRow) {
        return res.status(404).json({ error: 'Journal entry not found' });
      }
      patientId = logRow.patient_id;
      if (!logRow.entry_id) {
        effectiveEntryId = genId('entry');
        db.prepare('UPDATE self_logs SET entry_id = ? WHERE id = ?').run(effectiveEntryId, logRow.id);
      } else {
        effectiveEntryId = logRow.entry_id;
      }
    } else {
      const entryRow = db.prepare('SELECT patient_id FROM self_logs WHERE entry_id = ? LIMIT 1').get(entryId);
      if (!entryRow) {
        return res.status(404).json({ error: 'Journal entry not found' });
      }
      patientId = entryRow.patient_id;
    }

    const id = genId('sc');
    db.prepare(`
      INSERT INTO symptom_comments (id, entry_id, patient_id, doctor_id, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, effectiveEntryId, patientId, doctorId, text);

    const saved = db.prepare(`
      SELECT c.id, c.entry_id, c.comment, c.created_at,
             doc.name AS doctor_name, doc.specialization AS doctor_specialization
      FROM symptom_comments c
      JOIN users doc ON c.doctor_id = doc.id
      WHERE c.id = ?
    `).get(id);

    res.status(201).json({
      message: 'Guidance added — the patient can now see it on their journal entry.',
      comment: saved
    });

    // P27: guidance.created → the patient's tabs.
    emit({
      type: 'guidance.created',
      ids: [patientId],
      actor_name: req.user.name,
      summary: `${req.user.name} added guidance on your journal entry`,
      patient_id: patientId,
      entry_id: effectiveEntryId
    });
  } catch (error) {
    console.error('Error adding symptom comment:', error);
    res.status(500).json({ error: 'Failed to add guidance comment' });
  }
});

module.exports = router;
