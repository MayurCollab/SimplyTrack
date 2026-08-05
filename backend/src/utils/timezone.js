function getSystemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

module.exports = { getSystemTimezone };
