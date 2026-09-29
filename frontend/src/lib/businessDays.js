/** Add business days (Mon–Fri) to a date string (YYYY-MM-DD). */
export function addBusinessDays(dateInput, days) {
  if (!dateInput) return ''
  const result = new Date(`${dateInput}T00:00:00`)
  if (Number.isNaN(result.getTime())) return ''

  let remaining = Math.max(0, Math.floor(days ?? 0))
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) remaining -= 1
  }
  return result.toISOString().slice(0, 10)
}
