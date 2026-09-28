/**
 * Local (not UTC) calendar-date helpers.
 *
 * `new Date().toISOString().split('T')[0]` returns the date in UTC. The backend
 * derives "today" locally (utils/scheduling.js localDateStr), so for any user
 * east of UTC the two disagree for part of every day — in IST (UTC+5:30) that
 * is the first 5h30m of the morning, where a visit logged "today" is stored
 * against yesterday and a follow-up lands on the wrong day.
 *
 * These build the string from local getFullYear/getMonth/getDate instead.
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

/** Local YYYY-MM-DD for a Date (defaults to now). */
export function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local YYYY-MM-DD shifted by whole days. */
export function localDateStrPlusDays(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}
