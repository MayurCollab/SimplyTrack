function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Format whole seconds as hh:mm:ss (no rounding). */
export function formatSecondsAsHms(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds || 0))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

/**
 * Format fractional minutes as hh:mm:ss.
 * Uses floor on whole seconds only - no round-up of partial seconds.
 */
export function formatMinutesAsHms(totalMinutes) {
  const ms = Math.max(0, (totalMinutes || 0) * 60000)
  return formatSecondsAsHms(Math.floor(ms / 1000))
}

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
  return formatSecondsAsHms(elapsed)
}

/** Clock time for a timer start/stop. Same day → HH:mm, otherwise dd/MM HH:mm. */
export function formatClockTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const hh = pad2(date.getHours())
  const mm = pad2(date.getMinutes())
  if (sameDay) return `${hh}:${mm}`
  const dd = pad2(date.getDate())
  const mo = pad2(date.getMonth() + 1)
  return `${dd}/${mo} ${hh}:${mm}`
}

/** Ensure duration fields exist for display (e.g. pending notes from API). */
export function enrichTimeLog(timeLog) {
  if (!timeLog) return timeLog

  const enriched = { ...timeLog }

  if (enriched.systemDurationMinutes == null && enriched.startedAt && enriched.stoppedAt) {
    const start = new Date(enriched.startedAt).getTime()
    const stop = new Date(enriched.stoppedAt).getTime()
    enriched.systemDurationMinutes = Math.max(0, (stop - start) / 60000)
  }

  return enriched
}

export function formatTimeLogDuration(timeLog) {
  if (!timeLog) return null

  const log = enrichTimeLog(timeLog)

  if (log.correctedDurationMinutes != null) {
    return formatMinutesAsHms(log.correctedDurationMinutes)
  }
  if (log.systemDurationMinutes != null) {
    return formatMinutesAsHms(log.systemDurationMinutes)
  }
  if (log.startedAt && log.stoppedAt) {
    return formatElapsed(log.startedAt, new Date(log.stoppedAt).getTime())
  }
  if (log.startedAt) {
    return formatElapsed(log.startedAt)
  }
  return null
}

export function elapsedMinutes(startedAt, now = Date.now()) {
  if (!startedAt) return 0
  const start = new Date(startedAt).getTime()
  return Math.max(0, (now - start) / 60000)
}

export function liveLoggedMinutes(loggedMinutes, startedAt, now = Date.now()) {
  return (loggedMinutes || 0) + elapsedMinutes(startedAt, now)
}

export function formatHoursVsBudget(loggedMinutes, budgetHours) {
  const logged = formatMinutesAsHms(loggedMinutes)
  const budget = formatMinutesAsHms((budgetHours || 0) * 60)
  return `${logged} / ${budget}`
}

export function isOverBudget(loggedMinutes, budgetHours) {
  return (loggedMinutes || 0) > (budgetHours || 0) * 60
}
