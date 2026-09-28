const { db } = require('../db/database');
const { SLOT_DURATION_MINUTES } = require('../config');

/**
 * Slot-math engine (Round 2 Block V). Every availability/booking/reschedule
 * decision goes through here so the rules exist in exactly one place:
 *
 * A slot is OCCUPIED when any non-cancelled appointment row for that doctor
 * sits at that exact date+time (covers requested, confirmed, and the original
 * slot of a reschedule_proposed row), OR another patient is currently being
 * offered that exact slot as a proposed reschedule.
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Local-timezone YYYY-MM-DD (the clinic's wall clock, not UTC). */
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr() {
  return localDateStr();
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Set of "HH:MM" times already held for this doctor on this date. */
function occupiedTimes(doctorId, date) {
  const held = new Set();
  const original = db.prepare(`
    SELECT appointment_time FROM appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'
  `).all(doctorId, date);
  for (const row of original) {
    if (row.appointment_time) held.add(row.appointment_time);
  }
  // A reschedule_proposed row also holds its OFFERED slot so a second patient
  // can't be routed into the exact time being offered to someone else.
  const proposed = db.prepare(`
    SELECT proposed_time FROM appointments
    WHERE doctor_id = ? AND status = 'reschedule_proposed' AND proposed_date = ?
  `).all(doctorId, date);
  for (const row of proposed) {
    if (row.proposed_time) held.add(row.proposed_time);
  }
  return held;
}

/**
 * Full working-day slot list for a doctor on a date.
 * Returns { weekday, slots: [{ time, available }], availability_found }.
 * Past times are excluded when the date is today (server time, Phase 55).
 */
function getDaySlots(doctorId, date, { excludeAppointmentId = null } = {}) {
  const weekday = new Date(date + 'T00:00:00').getDay();

  const windows = db.prepare(`
    SELECT start_time, end_time FROM doctor_availability
    WHERE doctor_id = ? AND day_of_week = ?
    ORDER BY start_time ASC
  `).all(doctorId, weekday);

  const held = occupiedTimes(doctorId, date);
  const isToday = date === todayStr();
  const nowTime = nowHHMM();

  const slots = [];
  const seen = new Set();

  for (const w of windows) {
    if (!TIME_RE.test(w.start_time) || !TIME_RE.test(w.end_time)) continue;

    let [h, m] = w.start_time.split(':').map(Number);
    const [endH, endM] = w.end_time.split(':').map(Number);
    const endTotal = endH * 60 + endM;

    while (h * 60 + m + SLOT_DURATION_MINUTES <= endTotal) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (!seen.has(time)) {
        seen.add(time);
        let available = !held.has(time);
        if (excludeAppointmentId) {
          // When re-validating for a specific row (reschedule proposal / accept),
          // that row's own original slot must not block its own options.
          const own = db.prepare(`
            SELECT appointment_date, appointment_time, status FROM appointments WHERE id = ?
          `).get(excludeAppointmentId);
          if (own && own.appointment_date === date && own.appointment_time === time) {
            available = true;
          }
        }
        if (isToday && time <= nowTime) {
          available = false; // server-time past exclusion (Phase 55)
        }
        slots.push({ time, available });
      }
      m += SLOT_DURATION_MINUTES;
      h += Math.floor(m / 60);
      m %= 60;
    }
  }

  slots.sort((a, b) => a.time.localeCompare(b.time));
  return { weekday, slots, availability_found: windows.length > 0 };
}

/**
 * Validate that {date, time} is a real, currently-free slot for this doctor.
 * Returns { ok: true } or { ok: false, reason: 'format' | 'past' | 'off_schedule' | 'taken' | 'past_time_today' }.
 */
function validateSlot(doctorId, date, time, { excludeAppointmentId = null } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { ok: false, reason: 'format_date' };
  if (!TIME_RE.test(time || '')) return { ok: false, reason: 'format_time' };

  const today = todayStr();
  if (date < today) return { ok: false, reason: 'past_date' };

  const day = getDaySlots(doctorId, date, { excludeAppointmentId });
  if (!day.availability_found) return { ok: false, reason: 'off_schedule' };

  const slot = day.slots.find(s => s.time === time);
  if (!slot) return { ok: false, reason: 'off_schedule' };
  if (isToday(date) && time <= nowHHMM()) return { ok: false, reason: 'past_time_today' };
  if (!slot.available) return { ok: false, reason: 'taken' };

  return { ok: true };
}

function isToday(date) {
  return date === todayStr();
}

module.exports = {
  TIME_RE,
  localDateStr,
  todayStr,
  nowHHMM,
  occupiedTimes,
  getDaySlots,
  validateSlot,
  isToday
};
