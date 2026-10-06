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
  console.log('\n========================================');
  console.log('[SimplyTrack DEV OTP]');
  console.log(`Email:   ${to}`);
  if (purpose) console.log(`Purpose: ${purpose}`);
  console.log(`Code:    ${otp}`);
  console.log('Valid for 5 minutes');
  console.log('========================================\n');
}

async function sendMail({ to, subject, html, attachments = [] }) {
  // Local/dev: never hit SMTP — log only (OTP also prints via logDevOtp).
  // In-app Notification docs are separate and are always created in DB.
  if (config.isDev) {
    console.log('\n========================================');
    console.log('[SimplyTrack DEV MAIL — not sent (localhost/development)]');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    if (attachments?.length) {
      console.log(`Attachments: ${attachments.map((a) => a.filename).join(', ')}`);
    }
    console.log('========================================\n');
    return { mocked: true };
  }

  const transport = createTransport();

  if (!transport) {
    console.warn('[SimplyTrack] SMTP not configured — mail not sent');
    return { mocked: true };
  }

  try {
    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
      attachments,
    });
    return { mocked: false };
  } catch (err) {
    console.error('[SimplyTrack] SMTP send failed:', err.message);
    throw err;
  }
}

async function sendOtpEmail({ to, name, otp, purpose }) {
  const html = renderTemplate('otp-email.html', { name, otp });
  const subject = 'Your SimplyTrack Verification Code';

  if (config.isDev) {
    logDevOtp({ to, otp, purpose });
  }

  try {
    return await sendMail({ to, subject, html });
  } catch (err) {
    return { mocked: true, smtpFailed: true };
  }
}

async function sendMonthlyStatusReportEmail({
  to,
  recipientName,
  orgName,
  periodLabel,
  generatedAtLabel,
  timezone,
  summaryHtml,
  fileName,
  fileBuffer,
  isTest = false,
}) {
  const html = renderTemplate('monthly-status-report.html', {
    name: recipientName || 'there',
    orgName,
    periodLabel,
    generatedAtLabel,
    timezone,
    summaryHtml,
    testBanner: isTest
      ? '<p style="margin:0 0 16px;padding:10px 12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;color:#92400E;font-size:13px;"><strong>TEST REPORT</strong> — This is a manual test send, not the scheduled month-end run.</p>'
      : '',
  });

  const subject = isTest
    ? `[TEST] ${orgName} — Monthly Status Report (${periodLabel})`
    : `${orgName} — Monthly Status Report (${periodLabel})`;

  return sendMail({
    to,
    subject,
    html,
    attachments: [
      {
        filename: fileName,
        content: fileBuffer,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  });
}

module.exports = {
  sendOtpEmail,
  sendMail,
  sendMonthlyStatusReportEmail,
  renderTemplate,
};
