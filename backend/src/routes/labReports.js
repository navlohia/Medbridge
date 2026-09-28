const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { db, transaction } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { extractLabReport } = require('../db/geminiHelper');
const { LAB_REPORT_MAX_IMAGE_BYTES, LAB_REPORT_ALLOWED_MIMES, LAB_REPORT_UPLOADS_DIR } = require('../config');
const { localDateStr } = require('../utils/scheduling');
const { autoCompleteLabOrders } = require('../utils/labOrders');

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function ensureUploadsDir() {
  if (!fs.existsSync(LAB_REPORT_UPLOADS_DIR)) {
    fs.mkdirSync(LAB_REPORT_UPLOADS_DIR, { recursive: true });
  }
}

/** Map a raw AI test name onto the lab_tests catalog (Phase 80). */
function resolveCatalogTest(rawName) {
  const clean = String(rawName || '').trim();
  if (!clean) return null;

  // 1. Exact match (case-insensitive)
  let hit = db.prepare(
    'SELECT id, test_name, unit, normal_low, normal_high FROM lab_tests WHERE LOWER(test_name) = LOWER(?)'
  ).get(clean);
  if (hit) return hit;

  // 2. Substring match in either direction
  const all = db.prepare('SELECT id, test_name, unit, normal_low, normal_high FROM lab_tests').all();
  const lower = clean.toLowerCase();
  for (const t of all) {
    const tl = t.test_name.toLowerCase();
    if (tl.includes(lower) || lower.includes(tl)) return t;
  }

  // 3. Known alias map for common report phrasings vs. the seeded catalog
  const ALIASES = {
    'hba1c': ['glycosylated hemoglobin', 'glycated hemoglobin', 'a1c'],
    'fasting blood sugar': ['fasting glucose', 'fasting plasma glucose', 'fbs', 'glucose fasting'],
    'systolic bp': ['systolic', 'sbp'],
    'diastolic bp': ['diastolic', 'dbp'],
    'total cholesterol': ['cholesterol total', 'lipid profile total'],
    'wbc count': ['wbc', 'total leukocyte count', 'tlc', 'leucocyte count'],
    'hemoglobin (male)': ['hemoglobin', 'hb'],
    'hemoglobin (female)': ['hemoglobin', 'hb'],
    'weight': ['body weight', 'wt']
  };
  for (const [catalog, aliases] of Object.entries(ALIASES)) {
    if (aliases.some(a => lower.includes(a))) {
      hit = db.prepare(
        'SELECT id, test_name, unit, normal_low, normal_high FROM lab_tests WHERE LOWER(test_name) = LOWER(?)'
      ).get(catalog);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * POST /lab-reports/upload (patient) — Round 2 Phases 76–81, 87–88.
 * Body: { image_base64, mime_type }. Nothing touches self_logs here; the row
 * lands as pending_review. No key / failure / unreadable → needs_manual_entry,
 * never a 500.
 */
router.post('/upload', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const { image_base64, mime_type } = req.body || {};

    // Phase 77: server-side size/type validation with clear messages
    if (!image_base64 || typeof image_base64 !== 'string' || image_base64.length < 32) {
      return res.status(400).json({ error: 'No image data received — please attach a photo of the report.' });
    }
    const mime = String(mime_type || '').toLowerCase();
    if (!LAB_REPORT_ALLOWED_MIMES.includes(mime)) {
      return res.status(400).json({ error: 'Only JPG or PNG photos are supported (PDF is not supported yet).' });
    }
    const approxBytes = Math.floor(image_base64.length * 0.75);
    if (approxBytes > LAB_REPORT_MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: 'That photo is too large (over 5 MB) — try a smaller or cropped photo.' });
    }

    const patientId = req.user.id;

    // Phase 81: extraction before any write; failures degrade to manual entry.
    (async () => {
      let extracted = null;
      let needsManual = 0;
      let aiNotice = null;
      try {
        extracted = await extractLabReport(image_base64, mime);
      } catch (err) {
        console.warn('[LabReport] extraction threw:', err.message);
        extracted = null;
      }
      if (!extracted || !Array.isArray(extracted.rows) || extracted.rows.length === 0) {
        needsManual = 1;
        aiNotice = 'We could not read this report automatically. Enter the values below to keep everything on your record.';
      }

      const reportDate = extracted?.report_date || null;

      // Phase 80: normalize test names against the catalog where possible
      const rows = (extracted?.rows || []).map(r => {
        const catalogHit = resolveCatalogTest(r.test_name);
        return {
          raw_test_name: r.test_name,
          test_name: catalogHit ? catalogHit.test_name : r.test_name,
          value: r.value,
          unit: r.unit || (catalogHit ? catalogHit.unit : null),
          reference_range: r.reference_range || (catalogHit ? `${catalogHit.normal_low}–${catalogHit.normal_high}` : null),
          confidence: r.confidence,
          lab_test_id: catalogHit ? catalogHit.id : null,
          include: true
        };
      });

      ensureUploadsDir();
      const uploadId = genId('lru');
      const ext = mime === 'image/png' ? 'png' : 'jpg';
      const filePath = path.join(LAB_REPORT_UPLOADS_DIR, `${uploadId}.${ext}`);
      fs.writeFileSync(filePath, Buffer.from(image_base64, 'base64'));

      db.prepare(`
        INSERT INTO lab_report_uploads
          (id, patient_id, image_path, image_mime, image_size, report_date, extracted_json, needs_manual_entry, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')
      `).run(
        uploadId,
        patientId,
        filePath,
        mime,
        approxBytes,
        reportDate,
        JSON.stringify({ rows, ai_notice: aiNotice }),
        needsManual
      );

      res.status(201).json({
        message: needsManual
          ? 'Upload received, but we could not read it automatically — please enter the values manually.'
          : 'Report read successfully — review the values below before saving.',
        upload: {
          id: uploadId,
          report_date: reportDate,
          needs_manual_entry: Boolean(needsManual),
          ai_notice: aiNotice,
          rows,
          status: 'pending_review'
        }
      });
    })().catch(err => {
      console.error('[LabReport] upload handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process the upload — please try again.' });
      }
    });
  } catch (error) {
    console.error('Error uploading lab report:', error);
    res.status(500).json({ error: 'Failed to upload lab report' });
  }
});

/**
 * GET /lab-reports — patient's upload history (Phase 86).
 */
router.get('/', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, uploaded_at, report_date, image_path, image_mime, image_size,
             needs_manual_entry, status, confirmed_at, extracted_json
      FROM lab_report_uploads
      WHERE patient_id = ? AND status != 'discarded'
      ORDER BY uploaded_at DESC
      LIMIT 50
    `).all(req.user.id);

    res.json(rows.map(r => {
      let parsed = { rows: [] };
      try { parsed = JSON.parse(r.extracted_json || '{}'); } catch { /* keep default */ }
      const list = Array.isArray(parsed.rows) ? parsed.rows : [];
      return {
        id: r.id,
        uploaded_at: r.uploaded_at,
        report_date: r.report_date,
        image_url: `/uploads/${path.basename(r.image_path)}`,
        image_mime: r.image_mime,
        needs_manual_entry: Boolean(r.needs_manual_entry),
        status: r.status,
        confirmed_at: r.confirmed_at,
        row_count: list.length,
        row_summary: list.slice(0, 4).map(x => `${x.test_name}: ${x.value}${x.unit ? ' ' + x.unit : ''}`)
      };
    }));
  } catch (error) {
    console.error('Error listing lab reports:', error);
    res.status(500).json({ error: 'Failed to load lab report history' });
  }
});

/**
 * GET /lab-reports/:id — the pending extraction for review/edit (Phase 82).
 */
router.get('/:id', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const row = db.prepare(`
      SELECT id, patient_id, uploaded_at, report_date, image_path, image_mime,
             extracted_json, needs_manual_entry, status, confirmed_at
      FROM lab_report_uploads
      WHERE id = ? AND status != 'discarded'
    `).get(req.params.id);

    if (!row || row.patient_id !== req.user.id) {
      return res.status(404).json({ error: 'Lab report not found' });
    }

    let extracted = { rows: [], ai_notice: null };
    try { extracted = JSON.parse(row.extracted_json || '{}'); } catch { /* keep default */ }

    res.json({
      id: row.id,
      uploaded_at: row.uploaded_at,
      report_date: row.report_date,
      image_url: `/uploads/${path.basename(row.image_path)}`,
      image_mime: row.image_mime,
      needs_manual_entry: Boolean(row.needs_manual_entry),
      status: row.status,
      confirmed_at: row.confirmed_at,
      ai_notice: extracted.ai_notice || null,
      rows: Array.isArray(extracted.rows) ? extracted.rows : []
    });
  } catch (error) {
    console.error('Error fetching lab report:', error);
    res.status(500).json({ error: 'Failed to load lab report' });
  }
});

/**
 * POST /lab-reports/:id/confirm — Phases 83/84: write approved rows into
 * self_logs inside ONE transaction; autoCompleteLabOrders fires per row so a
 * confirmed upload auto-completes pending lab orders exactly like manual logging.
 */
router.post('/:id/confirm', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const upload = db.prepare(
      'SELECT * FROM lab_report_uploads WHERE id = ? AND patient_id = ?'
    ).get(req.params.id, req.user.id);

    if (!upload) return res.status(404).json({ error: 'Lab report not found' });
    if (upload.status === 'confirmed') {
      return res.status(409).json({ error: 'This report was already confirmed — confirmed reports are permanent.' });
    }
    if (upload.status === 'discarded') {
      return res.status(409).json({ error: 'This report was discarded and can no longer be confirmed.' });
    }

    const { rows, report_date } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'At least one test row is required to confirm.' });
    }
    if (rows.length > 12) {
      return res.status(400).json({ error: 'A maximum of 12 rows can be confirmed per report.' });
    }

    const effectiveDate = (report_date && /^\d{4}-\d{2}-\d{2}$/.test(report_date))
      ? report_date
      : (upload.report_date || localDateStr());

    const writtenLogs = [];
    const completedOrders = [];
    transaction((database) => {
      const insertLog = database.prepare(`
        INSERT INTO self_logs (id, patient_id, log_type, label, value, unit, log_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of rows) {
        const label = String(r.test_name || '').trim();
        const value = String(r.value ?? '').trim();
        if (!label || value === '') continue;
        const unit = r.unit ? String(r.unit).trim() : null;
        const logId = genId('log');
        insertLog.run(logId, req.user.id, 'vital', label, value, unit, effectiveDate);
        writtenLogs.push({ log_id: logId, test_name: label, value, unit, source: r.raw_test_name ? 'ai' : 'manual' });
        const completed = autoCompleteLabOrders(database, req.user.id, label, effectiveDate);
        completedOrders.push(...completed);
      }
      if (writtenLogs.length === 0) {
        throw new Error('NO_VALID_ROWS');
      }
      // Persist what was ACTUALLY confirmed into extracted_json so the history
      // and detail views reflect the permanent record (manual-entry rows too).
      let originalNotice = null;
      try { originalNotice = JSON.parse(upload.extracted_json || '{}').ai_notice || null; } catch { /* */ }
      const confirmedJson = JSON.stringify({
        rows: writtenLogs.map(l => ({
          test_name: l.test_name,
          value: l.value,
          unit: l.unit,
          include: true
        })),
        ai_notice: originalNotice,
        confirmed_from_manual_entry: writtenLogs.some(l => l.source === 'manual') || upload.needs_manual_entry === 1
      });
      database.prepare(`
        UPDATE lab_report_uploads
        SET status = 'confirmed', confirmed_log_ids = ?, confirmed_at = CURRENT_TIMESTAMP,
            extracted_json = ?
        WHERE id = ?
      `).run(JSON.stringify(writtenLogs.map(l => l.log_id)), confirmedJson, upload.id);
    });

    res.status(201).json({
      message: `Saved ${writtenLogs.length} reading${writtenLogs.length > 1 ? 's' : ''} from your report to your health record.`,
      written_rows: writtenLogs,
      completed_lab_orders: completedOrders,
      matched_order_count: completedOrders.length
    });
  } catch (error) {
    if (error.message === 'NO_VALID_ROWS') {
      return res.status(400).json({ error: 'None of the rows had a test name and value — nothing was saved.' });
    }
    console.error('Error confirming lab report:', error);
    res.status(500).json({ error: 'Failed to confirm lab report' });
  }
});

/**
 * POST /lab-reports/:id/discard — Phase 85: pending_review only; confirmed
 * uploads are permanent (append-only) and can never be discarded.
 */
router.post('/:id/discard', authenticateToken, requireRole('patient'), (req, res) => {
  try {
    const upload = db.prepare('SELECT * FROM lab_report_uploads WHERE id = ? AND patient_id = ?')
      .get(req.params.id, req.user.id);
    if (!upload) return res.status(404).json({ error: 'Lab report not found' });
    if (upload.status === 'confirmed') {
      return res.status(409).json({ error: 'Confirmed reports are permanent — they cannot be discarded.' });
    }
    // Discard = hard delete of the row + image, allowed only while pending_review
    db.prepare('DELETE FROM lab_report_uploads WHERE id = ?').run(upload.id);
    try { fs.unlinkSync(upload.image_path); } catch { /* file already gone */ }
    res.json({ message: 'Upload discarded — nothing was written to your health record.' });
  } catch (error) {
    console.error('Error discarding lab report:', error);
    res.status(500).json({ error: 'Failed to discard lab report' });
  }
});

module.exports = router;
