/**
 * Add business days (Mon–Fri) to a date. Skips weekends.
 * @param {Date|string} startDate
 * @param {number} days - number of business days to add (>= 0)
 * @returns {Date}
 */
function addBusinessDays(startDate, days) {
  const result = new Date(startDate);
  result.setHours(0, 0, 0, 0);

  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return result;
}

module.exports = { addBusinessDays };
