export const COMPLIANCE_PERIOD_TYPES = [
  { value: 'quarter_end', label: 'Quarter End' },
  { value: 'year_end', label: 'Year End' },
  { value: 'tax_year', label: 'Tax Year' },
  { value: 'payroll_month', label: 'Payroll Month' },
  { value: 'bookkeeping_month', label: 'Bookkeeping Month' },
  { value: 'cis_month', label: 'CIS Month' },
  { value: 'due_date', label: 'Due Date' },
]

const DATE_TYPES = new Set(['quarter_end', 'year_end', 'due_date'])
const MONTH_TYPES = new Set(['payroll_month', 'bookkeeping_month', 'cis_month'])

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDateDdMmYyyy(date) {
  const d = new Date(date)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

function formatMonthYear(date) {
  return new Date(date).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

export function isDateComplianceType(type) {
  return DATE_TYPES.has(type) || !type
}

export function isMonthComplianceType(type) {
  return MONTH_TYPES.has(type)
}

export function isTaxYearComplianceType(type) {
  return type === 'tax_year'
}

/** Format raw compliance input for task title preview (mirrors backend). */
export function formatCompliancePeriodValue(compliancePeriodInput, compliancePeriodType) {
  if (!compliancePeriodInput) return ''
  const raw = String(compliancePeriodInput).trim()
  if (!raw) return ''

  if (compliancePeriodType === 'tax_year') {
    const year = parseInt(raw, 10)
    if (Number.isNaN(year)) return raw
    return `${year}/${String(year + 1).slice(-2)}`
  }

  if (MONTH_TYPES.has(compliancePeriodType)) {
    const [y, m] = raw.split('-').map(Number)
    if (!y || !m) return raw
    const date = new Date(y, m - 1, 1)
    if (Number.isNaN(date.getTime())) return raw
    return formatMonthYear(date)
  }

  if (DATE_TYPES.has(compliancePeriodType) || !compliancePeriodType) {
    const date = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`)
    if (Number.isNaN(date.getTime())) return raw
    return formatDateDdMmYyyy(date)
  }

  return raw
}

export function buildTaskTitle(clientName, serviceName, compliancePeriodValue) {
  if (!clientName || !serviceName || !compliancePeriodValue) return ''
  return `${clientName} - ${serviceName} - ${compliancePeriodValue}`
}

export function compliancePeriodLabel(type) {
  return COMPLIANCE_PERIOD_TYPES.find((t) => t.value === type)?.label ?? 'Due Date'
}

/** Tax year options e.g. 2025 → label "2025/26" */
export function taxYearOptions() {
  const current = new Date().getFullYear()
  return Array.from({ length: 8 }, (_, i) => current - 5 + i).map((y) => ({
    value: String(y),
    label: `${y}/${String(y + 1).slice(-2)}`,
  }))
}

/** Resolve form input from stored task (supports legacy tasks without compliancePeriodInput). */
export function inferCompliancePeriodInput(task, service) {
  if (task?.compliancePeriodInput) return task.compliancePeriodInput

  const type = service?.compliancePeriodType || 'due_date'
  const due = task?.dueDate ? new Date(task.dueDate) : null
  if (!due || Number.isNaN(due.getTime())) return ''

  if (type === 'tax_year') return String(due.getFullYear())
  if (MONTH_TYPES.has(type)) {
    return `${due.getFullYear()}-${pad2(due.getMonth() + 1)}`
  }
  return due.toISOString().slice(0, 10)
}

export function toDateInputValue(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}
