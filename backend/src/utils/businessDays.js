/**
 * Normalize to local midnight for date-only comparisons.
 * YYYY-MM-DD strings are parsed as local calendar dates (not UTC).
 * @param {Date|string} value
 * @returns {Date|null}
 */
function toStartOfDay(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const raw = String(value).trim();
  const dayOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayOnly) {
    const d = new Date(
      Number(dayOnly[1]),
      Number(dayOnly[2]) - 1,
      Number(dayOnly[3]),
      0,
      0,
      0,
      0
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function isBusinessDay(date) {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6;
}

/**
 * Add business days (Mon–Fri) to a date. Skips weekends.
 * The start date itself is not counted (clock starts the next business day).
 * @param {Date|string} startDate
 * @param {number} days - number of business days to add (>= 0)
 * @returns {Date|null}
 */
function addBusinessDays(startDate, days) {
  const result = toStartOfDay(startDate);
  if (!result) return null;

  let remaining = Math.max(0, Math.floor(Number(days) || 0));
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) remaining -= 1;
  }
  return result;
}

/**
 * Count Mon–Fri days strictly after `startDate` and strictly before `endDate`.
 * Used for TAT days consumed before a query pause.
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {number}
 */
function countBusinessDaysExclusive(startDate, endDate) {
  const start = toStartOfDay(startDate);
  const end = toStartOfDay(endDate);
  if (!start || !end || end <= start) return 0;

  let count = 0;
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur < end) {
    if (isBusinessDay(cur)) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

module.exports = {
  toStartOfDay,
  isBusinessDay,
  addBusinessDays,
  countBusinessDaysExclusive,
};
