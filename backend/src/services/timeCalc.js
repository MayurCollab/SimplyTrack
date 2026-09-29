function computeDurationMinutes(startedAt, stoppedAt = new Date()) {
  const start = new Date(startedAt).getTime();
  const stop = new Date(stoppedAt).getTime();
  return Math.max(0, (stop - start) / 60000);
}

function effectiveDurationMinutes(log) {
  if (log.correctedDurationMinutes != null) return log.correctedDurationMinutes;
  return log.systemDurationMinutes ?? 0;
}

function formatMinutes(totalMinutes) {
  const mins = Math.max(0, Math.floor(totalMinutes || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format duration as hh:mm:ss using floor on whole seconds (no round-up). */
function formatMinutesAsHms(totalMinutes) {
  const ms = Math.max(0, (totalMinutes || 0) * 60000);
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

module.exports = {
  computeDurationMinutes,
  effectiveDurationMinutes,
  formatMinutes,
  formatMinutesAsHms,
};
