/** Parse YYYY-MM-DD (or Date) to local midnight. */
function toStartOfDay(dateInput) {
  if (!dateInput) return null
  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) return null
    const d = new Date(dateInput)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const raw = String(dateInput).trim()
  const dayOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dayOnly) {
    const d = new Date(
      Number(dayOnly[1]),
      Number(dayOnly[2]) - 1,
      Number(dayOnly[3]),
      0,
      0,
      0,
      0
    )
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function isBusinessDay(date) {
  const dow = date.getDay()
  return dow !== 0 && dow !== 6
}

function formatDateInput(date) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Add business days (Mon–Fri). Start date itself is not counted. */
export function addBusinessDays(dateInput, days) {
  const result = toStartOfDay(dateInput)
  if (!result) return ''

  let remaining = Math.max(0, Math.floor(Number(days) || 0))
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    if (isBusinessDay(result)) remaining -= 1
  }
  return formatDateInput(result)
}

/** Business days strictly after start and strictly before end. */
export function countBusinessDaysExclusive(startInput, endInput) {
  const start = toStartOfDay(startInput)
  const end = toStartOfDay(endInput)
  if (!start || !end || end <= start) return 0

  let count = 0
  const cur = new Date(start)
  cur.setDate(cur.getDate() + 1)
  while (cur < end) {
    if (isBusinessDay(cur)) count += 1
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/**
 * TAT target date:
 * - base = receive + N business days
 * - if query + reply: remaining = N - days before query; target = reply + remaining
 */
export function computeTargetDate({
  receiveDate,
  turnaroundBusinessDays = 0,
  querySentDate = '',
  replyReceivedDate = '',
} = {}) {
  if (!receiveDate) return ''

  const tat = Math.max(0, Math.floor(Number(turnaroundBusinessDays) || 0))
  const base = addBusinessDays(receiveDate, tat)
  if (!base) return ''

  if (!querySentDate || !replyReceivedDate) return base

  const receive = toStartOfDay(receiveDate)
  const query = toStartOfDay(querySentDate)
  const reply = toStartOfDay(replyReceivedDate)
  if (!receive || !query || !reply || reply < query) return base

  const consumed = countBusinessDaysExclusive(receiveDate, querySentDate)
  const remaining = Math.max(0, tat - consumed)
  return addBusinessDays(replyReceivedDate, remaining)
}
