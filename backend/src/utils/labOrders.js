/**
 * Lab-order auto-complete matching (extracted Round 2 Block VI so both
 * self-logs and lab-report confirm share one implementation).
 *
 * A patient-logged vital completes a matching pending lab order when its
 * scheduled_date falls within ± LAB_ORDER_MATCH_WINDOW_DAYS of the log date.
 * Runs inside the caller's transaction. Returns completed order ids.
 */
const LAB_ORDER_MATCH_WINDOW_DAYS = 14;

function autoCompleteLabOrders(database, patientId, label, logDate) {
  const { localDateStr } = require('./scheduling');

  const windowStart = new Date(logDate + 'T00:00:00');
  windowStart.setDate(windowStart.getDate() - LAB_ORDER_MATCH_WINDOW_DAYS);
  const windowEnd = new Date(logDate + 'T00:00:00');
  windowEnd.setDate(windowEnd.getDate() + LAB_ORDER_MATCH_WINDOW_DAYS);
  const wStart = localDateStr(windowStart);
  const wEnd = localDateStr(windowEnd);

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

module.exports = { autoCompleteLabOrders, LAB_ORDER_MATCH_WINDOW_DAYS };
