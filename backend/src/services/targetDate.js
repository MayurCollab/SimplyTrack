const { addBusinessDays } = require('../utils/businessDays');

/**
 * Compute target date from task receive date + service turnaround (business days).
 */
function computeTargetDate(receiveDate, turnaroundBusinessDays = 0) {
  if (!receiveDate) return null;
  const date = new Date(receiveDate);
  if (Number.isNaN(date.getTime())) return null;
  return addBusinessDays(date, turnaroundBusinessDays ?? 0);
}

function canEditTargetDate(req) {
  return (
    req.user.role === 'super_admin' ||
    req.user.role === 'owner' ||
    req.canEditTargetDate === true
  );
}

module.exports = { computeTargetDate, canEditTargetDate };
