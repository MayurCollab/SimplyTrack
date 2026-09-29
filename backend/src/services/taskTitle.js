const { DATE_TYPES, MONTH_TYPES } = require('../constants/compliancePeriod');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateDdMmYyyy(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatMonthYear(date) {
  return date.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * Format raw compliance period input into display value for task title.
 * @param {string} compliancePeriodInput - date (YYYY-MM-DD), month (YYYY-MM), or tax year start (YYYY)
 */
function formatCompliancePeriodValue(compliancePeriodInput, compliancePeriodType) {
  if (!compliancePeriodInput) return '';
  const raw = String(compliancePeriodInput).trim();
  if (!raw) return '';

  if (compliancePeriodType === 'tax_year') {
    const year = parseInt(raw, 10);
    if (Number.isNaN(year)) return raw;
    return `${year}/${String(year + 1).slice(-2)}`;
  }

  if (MONTH_TYPES.has(compliancePeriodType)) {
    const [y, m] = raw.split('-').map(Number);
    if (!y || !m) return raw;
    const date = new Date(y, m - 1, 1);
    if (Number.isNaN(date.getTime())) return raw;
    return formatMonthYear(date);
  }

  if (DATE_TYPES.has(compliancePeriodType) || !compliancePeriodType) {
    const date = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return raw;
    return formatDateDdMmYyyy(date);
  }

  return raw;
}

/**
 * Build task title: Client Name - Service - Compliance Period
 */
function buildTaskTitle(clientName, serviceName, compliancePeriodValue) {
  if (!clientName || !serviceName || !compliancePeriodValue) return '';
  return `${clientName} - ${serviceName} - ${compliancePeriodValue}`;
}

/** Derive raw input from stored formatted value or due date (legacy tasks). */
function inferCompliancePeriodInput(task, service) {
  if (task.compliancePeriodInput) return task.compliancePeriodInput;

  const type = service?.compliancePeriodType || 'due_date';
  const due = task.dueDate ? new Date(task.dueDate) : null;
  if (!due || Number.isNaN(due.getTime())) return '';

  if (type === 'tax_year') {
    return String(due.getFullYear());
  }
  if (MONTH_TYPES.has(type)) {
    return `${due.getFullYear()}-${pad2(due.getMonth() + 1)}`;
  }
  return due.toISOString().slice(0, 10);
}

module.exports = {
  formatCompliancePeriodValue,
  buildTaskTitle,
  inferCompliancePeriodInput,
};
