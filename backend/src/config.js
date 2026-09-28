/**
 * Shared backend config — single source of truth for scheduling math.
 * Referenced by availability computation, booking validation, and the
 * reschedule slot picker. No duplicated magic numbers elsewhere.
 */

const path = require('path');

// Length of one appointment slot, in minutes (Round 2 Phase 18).
const SLOT_DURATION_MINUTES = 30;

// Fallback time (HH:MM) used when a legacy row or visit-created appointment
// has no explicit time — mid-morning clinic default (Round 2 Phase 67).
const DEFAULT_APPOINTMENT_TIME = '09:00';

// Lab-report upload limits (Round 2 Block VI)
const LAB_REPORT_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const LAB_REPORT_ALLOWED_MIMES = ['image/jpeg', 'image/png'];
const LAB_REPORT_UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

module.exports = {
  SLOT_DURATION_MINUTES,
  DEFAULT_APPOINTMENT_TIME,
  LAB_REPORT_MAX_IMAGE_BYTES,
  LAB_REPORT_ALLOWED_MIMES,
  LAB_REPORT_UPLOADS_DIR
};
