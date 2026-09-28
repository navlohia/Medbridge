const express = require('express');
const { emit } = require('../utils/events');
const router = express.Router();
const { db, transaction } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { DEFAULT_APPOINTMENT_TIME } = require('../config');

/**
 * A REAL calendar date, not merely the right shape. A regex-only check let
 * '9999-13-45' through and it was written to the DB as a permanent, unbookable
 * appointment date. The round-trip comparison rejects overflow like 02-31.
 */
function isRealDateStr(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Checks for therapeutic class duplication and clinical drug interactions
 * between newly selected medicines and the patient's currently active medicines.
 */
function checkDrugConflicts(patientId, newMedicineIds) {
  if (!newMedicineIds || newMedicineIds.length === 0) {
    return [];
  }

  // 1. Fetch patient's active medicines from their most recent visits
  const activeMedsRaw = db.prepare(`
    SELECT DISTINCT m.id, m.name, m.composition, m.therapeutic_class, v.visit_date
    FROM prescriptions p
    JOIN visits v ON p.visit_id = v.id
    JOIN medicines m ON p.medicine_id = m.id
    WHERE v.patient_id = ?
    ORDER BY v.visit_date DESC
    LIMIT 15
  `).all(patientId);

  // Deduplicate activeMeds by medicine id / name
  const seenActive = new Set();
  const activeMeds = [];
  for (const m of activeMedsRaw) {
    const key = m.name.toLowerCase().trim();
    if (!seenActive.has(key)) {
      seenActive.add(key);
      activeMeds.push(m);
    }
  }

  // 2. Fetch details of newly selected medicines
  const placeholders = newMedicineIds.map(() => '?').join(',');
  const newMeds = db.prepare(`
    SELECT id, name, composition, therapeutic_class
    FROM medicines
    WHERE id IN (${placeholders})
  `).all(...newMedicineIds);

  const warnings = [];

  // Check new meds against active meds
  for (const nMed of newMeds) {
    for (const aMed of activeMeds) {
      // Direct duplicate medicine
      if (nMed.id === aMed.id || nMed.name.toLowerCase() === aMed.name.toLowerCase()) {
        warnings.push({
          type: 'duplicate_medicine',
          severity: 'high',
          new_medicine: nMed.name,
          active_medicine: aMed.name,
          therapeutic_class: nMed.therapeutic_class,
          message: `Direct Duplication: Patient is currently active on ${aMed.name}. Prescribing this again risks unintentional double-dosing.`
        });
        continue;
      }

      // Class duplication
      if (nMed.therapeutic_class === aMed.therapeutic_class && nMed.therapeutic_class !== 'General Therapeutic') {
        let riskDetail = 'additive adverse effects';
        if (nMed.therapeutic_class.includes('Antidiabetic')) {
          riskDetail = 'heightened risk of hypoglycemia (excessive blood glucose drop)';
        } else if (nMed.therapeutic_class.includes('Antihypertensive')) {
          riskDetail = 'risk of excessive hypotension (blood pressure drop) and syncope';
        } else if (nMed.therapeutic_class.includes('NSAID')) {
          riskDetail = 'elevated danger of severe gastric ulceration and renal toxicity';
        } else if (nMed.therapeutic_class.includes('Antibiotic')) {
          riskDetail = 'increased risk of toxicity and antimicrobial resistance';
        }

        warnings.push({
          type: 'class_duplication',
          severity: 'warning',
          new_medicine: nMed.name,
          active_medicine: aMed.name,
          therapeutic_class: nMed.therapeutic_class,
          message: `Therapeutic Class Overlap: Both ${nMed.name} and active ${aMed.name} belong to ${nMed.therapeutic_class}. Concurrent administration carries ${riskDetail}.`
        });
      }

      // Cross-class: NSAID + Anticoagulant
      if (
        (nMed.therapeutic_class.includes('NSAID') && aMed.therapeutic_class.includes('Anticoagulant')) ||
        (nMed.therapeutic_class.includes('Anticoagulant') && aMed.therapeutic_class.includes('NSAID'))
      ) {
        warnings.push({
          type: 'drug_interaction',
          severity: 'urgent',
          new_medicine: nMed.name,
          active_medicine: aMed.name,
          therapeutic_class: `${nMed.therapeutic_class} + ${aMed.therapeutic_class}`,
          message: `High Bleeding Risk: Concurrent use of ${nMed.name} with anticoagulant/antiplatelet ${aMed.name} significantly elevates gastrointestinal bleeding risk.`
        });
      }

      // Cross-class: Antihypertensive + NSAID
      if (nMed.therapeutic_class.includes('NSAID') && aMed.therapeutic_class.includes('Antihypertensive')) {
        warnings.push({
          type: 'drug_interaction',
          severity: 'warning',
          new_medicine: nMed.name,
          active_medicine: aMed.name,
          therapeutic_class: 'NSAID + Antihypertensive',
          message: `Blood Pressure Blunting: ${nMed.name} (NSAID) can counteract the blood-pressure lowering effect of active ${aMed.name}.`
        });
      }
    }
  }

  // Intra-prescription checks (conflicts between the newly prescribed items themselves)
  for (let i = 0; i < newMeds.length; i++) {
    for (let j = i + 1; j < newMeds.length; j++) {
      const medA = newMeds[i];
      const medB = newMeds[j];
      if (medA.therapeutic_class === medB.therapeutic_class && medA.therapeutic_class !== 'General Therapeutic') {
        warnings.push({
          type: 'intra_prescription_overlap',
          severity: 'warning',
          new_medicine: medA.name,
          active_medicine: medB.name,
          therapeutic_class: medA.therapeutic_class,
          message: `Co-Prescription Warning: You have selected both ${medA.name} and ${medB.name} from the same class (${medA.therapeutic_class}) in this single visit.`
        });
      }
    }
  }

  return warnings;
}

// POST /visits/check-conflicts - Live check for frontend UI
router.post('/check-conflicts', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const { patient_id, medicine_ids } = req.body;
    if (!patient_id) {
      return res.status(400).json({ error: 'patient_id is required' });
    }
    const warnings = checkDrugConflicts(patient_id, medicine_ids || []);
    res.json({ conflict_warnings: warnings });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({ error: 'Failed to evaluate medicine conflicts' });
  }
});

// POST /visits - Log New Visit Flow (Atomic Transaction)
router.post('/', authenticateToken, requireRole('doctor'), (req, res) => {
  try {
    const {
      patient_id,
      diagnosis_id,
      notes,
      prescriptions,
      lab_orders,
      next_appointment_date,
      next_appointment_time,
      appointment_reason
    } = req.body;

    if (!patient_id || !diagnosis_id) {
      return res.status(400).json({ error: 'patient_id and diagnosis_id are required' });
    }

    // A destructuring default only fires for `undefined`, so an explicit
    // `prescriptions: null` reached .map() and 500'd, losing the entire visit.
    const rxList = Array.isArray(prescriptions) ? prescriptions : [];
    const labList = Array.isArray(lab_orders) ? lab_orders : [];

    if (req.body.visit_date && !isRealDateStr(req.body.visit_date)) {
      return res.status(400).json({ error: 'visit_date must be a real calendar date in YYYY-MM-DD format' });
    }

    const doctorId = req.user.id;
    const visitDate = req.body.visit_date || require('../utils/scheduling').localDateStr();
    const visitId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Evaluate conflicts before saving (warn, never block)
    const newMedIds = rxList.map(p => p && p.medicine_id).filter(Boolean);
    const conflictWarnings = checkDrugConflicts(patient_id, newMedIds);

    // Follow-up slot: validate the date and check availability BEFORE opening the
    // transaction. Previously this insert skipped every check POST /appointments
    // performs, so logging a visit silently burned a real slot as a 'confirmed'
    // appointment that the doctor then had no way to release.
    let followUp = null;
    const rawFollowUpDate = next_appointment_date === undefined || next_appointment_date === null
      ? '' : String(next_appointment_date).trim();
    if (rawFollowUpDate !== '') {
      if (!isRealDateStr(rawFollowUpDate)) {
        return res.status(400).json({ error: 'next_appointment_date must be a real calendar date in YYYY-MM-DD format' });
      }
      const rawTime = next_appointment_time ? String(next_appointment_time).trim() : '';
      const slotTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : DEFAULT_APPOINTMENT_TIME;
      const taken = db.prepare(`
        SELECT id FROM appointments
        WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'cancelled'
        LIMIT 1
      `).get(doctorId, rawFollowUpDate, slotTime);
      if (taken) {
        return res.status(409).json({
          error: 'That follow-up slot is already taken. Pick another time, or leave the follow-up blank.'
        });
      }
      followUp = { date: rawFollowUpDate, time: slotTime };
    }

    // Save everything in one single atomic SQLite transaction
    transaction((database) => {
      // 1. Insert Visit record
      database.prepare(`
        INSERT INTO visits (id, patient_id, doctor_id, visit_date, diagnosis_id, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(visitId, patient_id, doctorId, visitDate, diagnosis_id, notes || '');

      // 2. Insert Prescriptions
      const insertPrescription = database.prepare(`
        INSERT INTO prescriptions (id, visit_id, medicine_id, dosage, duration)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const p of rxList) {
        if (!p || !p.medicine_id) continue;
        const rxId = `rx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        insertPrescription.run(rxId, visitId, p.medicine_id, p.dosage || 'As directed', p.duration || '30 days');
      }

      // 3. Insert Lab Orders
      const insertLabOrder = database.prepare(`
        INSERT INTO lab_orders (id, visit_id, test_name, scheduled_date, status)
        VALUES (?, ?, ?, ?, 'pending')
      `);
      for (const lo of labList) {
        if (!lo || !lo.test_name) continue;
        const loId = `lo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        insertLabOrder.run(
          loId,
          visitId,
          lo.test_name,
          lo.scheduled_date || visitDate
        );
      }

      // 4. Insert the follow-up appointment (validated + conflict-checked above)
      if (followUp) {
        const aptId = `apt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        database.prepare(`
          INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, appointment_time, reason)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          aptId,
          patient_id,
          doctorId,
          followUp.date,
          followUp.time,
          appointment_reason || 'Routine follow-up'
        );
      }
    });

    res.status(201).json({
      message: 'Visit and clinical records logged successfully',
      visit_id: visitId,
      conflict_warnings: conflictWarnings
    });

    // P27: visit.created → ONLY the patient's tabs (per brief; clinical event,
    // admins are not in the audience).
    const patientName = db.prepare('SELECT name FROM users WHERE id = ?').get(patient_id)?.name || 'The patient';
    emit({
      type: 'visit.created',
      ids: [patient_id],
      actor_name: req.user.name,
      summary: `Dr. ${req.user.name.replace(/^Dr\.?\s*/i, '')} documented a visit for ${patientName}`,
      visit_id: visitId,
      patient_id,
      doctor_id: doctorId
    });
  } catch (error) {
    console.error('Error creating visit:', error);
    res.status(500).json({ error: 'Failed to record visit in database' });
  }
});

module.exports = router;
