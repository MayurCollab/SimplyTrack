export function formatMinutes(totalMinutes) {
  const mins = Math.max(0, Math.floor(totalMinutes || 0))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatElapsed(startedAt, now = Date.now()) {
  const start = new Date(startedAt).getTime()
  const elapsed = Math.max(0, Math.floor((now - start) / 1000))
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatHoursVsBudget(loggedMinutes, budgetHours) {
  const logged = formatMinutes(loggedMinutes)
  const budget = formatMinutes((budgetHours || 0) * 60)
  return `${logged} / ${budget}`
}

export function isOverBudget(loggedMinutes, budgetHours) {
  return (loggedMinutes || 0) > (budgetHours || 0) * 60
}
