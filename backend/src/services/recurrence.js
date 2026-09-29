const { DATE_TYPES, MONTH_TYPES } = require('../constants/compliancePeriod');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthsForFrequency(frequency) {
  if (frequency === 'monthly') return 1;
  if (frequency === 'quarterly') return 3;
  if (frequency === 'yearly') return 12;
  return 3;
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

function dayAfter(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Parse compliance period input into a Date representing the period end / reference.
 */
function complianceInputToDate(input, compliancePeriodType) {
  if (!input) return null;
  const raw = String(input).trim();

  if (compliancePeriodType === 'tax_year') {
    const year = parseInt(raw, 10);
    if (Number.isNaN(year)) return null;
    // Use 5 April as UK tax year end reference for scheduling
    return new Date(year + 1, 3, 5);
  }

  if (MONTH_TYPES.has(compliancePeriodType)) {
    const [y, m] = raw.split('-').map(Number);
    if (!y || !m) return null;
    return new Date(y, m, 0); // last day of month
  }

  const date = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format a Date back into compliance period input for a service type.
 */
function dateToComplianceInput(date, compliancePeriodType) {
  if (!date) return '';
  const d = new Date(date);

  if (compliancePeriodType === 'tax_year') {
    // Tax year input is the start year
    const endYear = d.getFullYear();
    // If date is Apr-Dec, tax year started previous calendar year conceptually;
    // our input is start year: for 5 Apr 2027 end → start year 2026
    if (d.getMonth() < 3 || (d.getMonth() === 3 && d.getDate() < 5)) {
      return String(endYear - 1);
    }
    return String(endYear - 1);
  }

  if (MONTH_TYPES.has(compliancePeriodType)) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Advance compliance period input by frequency.
 */
function advanceCompliancePeriodInput(input, compliancePeriodType, frequency) {
  const months = monthsForFrequency(frequency);

  if (compliancePeriodType === 'tax_year') {
    const year = parseInt(String(input).trim(), 10);
    if (Number.isNaN(year)) return input;
    const step = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 1 : 1;
    // Tax year advances yearly regardless; quarterly/monthly still +1 year for SA
    return String(year + (frequency === 'yearly' || frequency === 'quarterly' || frequency === 'monthly' ? 1 : step));
  }

  if (MONTH_TYPES.has(compliancePeriodType)) {
    const [y, m] = String(input).split('-').map(Number);
    if (!y || !m) return input;
    const d = addMonths(new Date(y, m - 1, 1), months);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  const base = complianceInputToDate(input, compliancePeriodType || 'due_date');
  if (!base) return input;
  const next = addMonths(base, months);
  return dateToComplianceInput(next, compliancePeriodType || 'due_date');
}

/**
 * Due date for a suggested task = compliance period reference date.
 */
function dueDateFromComplianceInput(input, compliancePeriodType) {
  return complianceInputToDate(input, compliancePeriodType);
}

/**
 * Suggest the next task the day after the next compliance period ends.
 */
function suggestAtFromComplianceInput(input, compliancePeriodType) {
  const periodEnd = complianceInputToDate(input, compliancePeriodType);
  if (!periodEnd) return null;
  return dayAfter(periodEnd);
}

module.exports = {
  advanceCompliancePeriodInput,
  dueDateFromComplianceInput,
  suggestAtFromComplianceInput,
  complianceInputToDate,
  dateToComplianceInput,
  dayAfter,
  FREQUENCIES: ['monthly', 'quarterly', 'yearly'],
};
