import moment from 'moment-timezone'

const LEGACY_ALIASES = {
  'Asia/Calcutta': 'Asia/Kolkata',
}

export function normalizeTimezone(timezone) {
  if (!timezone) return moment.tz.guess()
  return LEGACY_ALIASES[timezone] || timezone
}

export function getSystemTimezone() {
  return normalizeTimezone(moment.tz.guess())
}

export function getTimezoneOptions() {
  const system = getSystemTimezone()
  const names = moment.tz.names().filter((tz) => {
    if (tz === system) return false
    if (tz === 'Asia/Calcutta') return false
    return true
  })

  return [system, ...names]
}
