const express = require('express');
const router = express.Router();
const { db, transaction } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const VALID_DURATIONS = ['Today', '2-3 days', 'A week+', 'Custom'];

// A patient-logged vital completes a matching pending lab order when its
// scheduled_date falls within this many days of the log date.
const LAB_ORDER_MATCH_WINDOW_DAYS = 14;

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Phase 15 hook: after a vital is logged, complete any pending lab order for the
 * same test_name whose scheduled_date is within +/- LAB_ORDER_MATCH_WINDOW_DAYS
 * of the log date. Runs inside the caller's transaction. Returns completed ids.
 */
function autoCompleteLabOrders(database, patientId, label, logDate) {
  const windowStart = new Date(logDate);
  windowStart.setDate(windowStart.getDate() - LAB_ORDER_MATCH_WINDOW_DAYS);
  const windowEnd = new Date(logDate);
  windowEnd.setDate(windowEnd.getDate() + LAB_ORDER_MATCH_WINDOW_DAYS);
  const wStart = windowStart.toISOString().split('T')[0];
  const wEnd = windowEnd.toISOString().split('T')[0];

  const matches = database.prepare(`
    SELECT lo.id
    FROM lab_orders lo
    JOIN visits v ON lo.visit_id = v.id
    WHERE v.patient_id = ?
      AND lo.status = 'pending'
      AND lo.test_name = ?
      AND lo.scheduled_date >= ? AND lo.scheduled_date <= ?
  `).all(patientId, label, wStart, wEnd);

  const completedIds = [];
  if (matches.length > 0) {
    const update = database.prepare(`UPDATE lab_orders SET status = 'completed' WHERE id = ?`);
    for (const m of matches) {
      update.run(m.id);
      completedIds.push(m.id);
    }
  }
  return completedIds;
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
  } catch (error) {
    console.error('Error recording self-log:', error);
    res.status(500).json({ error: 'Failed to record self-log entry' });
  }
});

module.exports = router;
