const COMPLIANCE_PERIOD_TYPES = [
  'quarter_end',
  'year_end',
  'tax_year',
  'payroll_month',
  'bookkeeping_month',
  'cis_month',
  'due_date',
];

const DATE_TYPES = new Set(['quarter_end', 'year_end', 'due_date']);
const MONTH_TYPES = new Set(['payroll_month', 'bookkeeping_month', 'cis_month']);

module.exports = {
  COMPLIANCE_PERIOD_TYPES,
  DATE_TYPES,
  MONTH_TYPES,
};
