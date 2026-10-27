const {
  addBusinessDays,
  countBusinessDaysExclusive,
  toStartOfDay,
} = require('../utils/businessDays');

/**
 * Compute task Target Date from TAT (turnaround business days).
 *
 * Rules:
 * - Base: receive date + N business days (receive day not counted; Sat/Sun skipped)
 * - Query Sent pauses the clock: days consumed = business days strictly after
 *   receive and strictly before query sent
 * - Reply Received resumes: target = reply + remaining business days
 *   (reply day not counted). If still waiting on reply, keep the frozen base target.
 *
 * Supports legacy call shape: computeTargetDate(receiveDate, turnaroundDays)
 *
 * @param {Date|string|{
 *   receiveDate: Date|string,
 *   turnaroundBusinessDays?: number,
 *   querySentDate?: Date|string|null,
 *   replyReceivedDate?: Date|string|null,
 * }} receiveDateOrOpts
 * @param {number} [legacyTurnaround]
 * @returns {Date|null}
 */
function computeTargetDate(receiveDateOrOpts, legacyTurnaround = 0) {
  let receiveDate;
  let turnaroundBusinessDays = 0;
  let querySentDate = null;
  let replyReceivedDate = null;

  if (
    receiveDateOrOpts &&
    typeof receiveDateOrOpts === 'object' &&
    !(receiveDateOrOpts instanceof Date) &&
    ('receiveDate' in receiveDateOrOpts || 'turnaroundBusinessDays' in receiveDateOrOpts)
  ) {
    receiveDate = receiveDateOrOpts.receiveDate;
    turnaroundBusinessDays = receiveDateOrOpts.turnaroundBusinessDays ?? 0;
    querySentDate = receiveDateOrOpts.querySentDate ?? null;
    replyReceivedDate = receiveDateOrOpts.replyReceivedDate ?? null;
  } else {
    receiveDate = receiveDateOrOpts;
    turnaroundBusinessDays = legacyTurnaround ?? 0;
  }

  const receive = toStartOfDay(receiveDate);
  if (!receive) return null;

  const tat = Math.max(0, Math.floor(Number(turnaroundBusinessDays) || 0));
  const baseTarget = addBusinessDays(receive, tat);

  const query = toStartOfDay(querySentDate);
  const reply = toStartOfDay(replyReceivedDate);

  // Need both dates, and reply on/after query, to extend the target
  if (!query || !reply || reply < query) {
    return baseTarget;
  }

  const consumed = countBusinessDaysExclusive(receive, query);
  const remaining = Math.max(0, tat - consumed);
  return addBusinessDays(reply, remaining);
}

function canEditTargetDate(req) {
  return (
    req.user.role === 'super_admin' ||
    req.user.role === 'owner' ||
    req.canEditTargetDate === true
  );
}

module.exports = { computeTargetDate, canEditTargetDate };
