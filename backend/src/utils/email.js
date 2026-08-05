const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function isValidEmail(value) {
  if (!value || !String(value).trim()) return true;
  return EMAIL_RE.test(String(value).trim());
}

module.exports = { isValidEmail, EMAIL_RE };
