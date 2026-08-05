const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../config/env');

function renderTemplate(templateName, vars) {
  const filePath = path.join(__dirname, '..', 'templates', templateName);
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, String(value ?? ''));
  }
  return html;
}

function createTransport() {
  if (!config.smtp.user || !config.smtp.pass) {
    return null;
  }
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

function logDevOtp({ to, otp, purpose }) {
  // Always print in non-production so OTP is visible without SMTP
  console.log('\n========================================');
  console.log('[SimplyTrack DEV OTP]');
  console.log(`Email:   ${to}`);
  if (purpose) console.log(`Purpose: ${purpose}`);
  console.log(`Code:    ${otp}`);
  console.log('Valid for 5 minutes');
  console.log('========================================\n');
}

async function sendOtpEmail({ to, name, otp, purpose }) {
  const html = renderTemplate('otp-email.html', { name, otp });
  const subject = 'Your SimplyTrack Verification Code';
  const transport = createTransport();

  // Always log OTP in development - even if SMTP is configured
  if (config.isDev) {
    logDevOtp({ to, otp, purpose });
  }

  if (!transport) {
    return { mocked: true };
  }

  try {
    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
    });
    return { mocked: false };
  } catch (err) {
    console.error('[SimplyTrack] SMTP send failed:', err.message);
    return { mocked: true, smtpFailed: true };
  }
}

module.exports = { sendOtpEmail, renderTemplate };
