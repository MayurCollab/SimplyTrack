const bcrypt = require('bcryptjs');
const OtpToken = require('../models/OtpToken');
const config = require('../config/env');
const { sendOtpEmail } = require('./mailer');

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createAndSendOtp({ email, purpose, name, meta = {} }) {
  const code = generateOtpCode();
  const hashed = await bcrypt.hash(code, 10);

  await OtpToken.deleteMany({ email, purpose, consumedAt: null });

  await OtpToken.create({
    email,
    code: hashed,
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    meta,
  });

  await sendOtpEmail({
    to: email,
    name: name || email,
    otp: code,
    purpose,
  });

  return {
    expiresInSeconds: OTP_TTL_MS / 1000,
    devOtp: config.isDev ? code : undefined,
  };
}

async function verifyOtp({ email, purpose, otp }) {
  const record = await OtpToken.findOne({
    email,
    purpose,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!record) {
    return { ok: false, error: 'No active OTP found. Please request a new one.' };
  }

  if (record.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'OTP has expired. Please request a new one.' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many failed attempts. Please request a new OTP.' };
  }

  const match = await bcrypt.compare(otp, record.code);
  if (!match) {
    record.attempts += 1;
    await record.save();
    const remaining = MAX_ATTEMPTS - record.attempts;
    return {
      ok: false,
      error:
        remaining > 0
          ? `Invalid OTP. ${remaining} attempt(s) remaining.`
          : 'Too many failed attempts. Please request a new OTP.',
    };
  }

  record.consumedAt = new Date();
  await record.save();

  return { ok: true, meta: record.meta || {} };
}

module.exports = { createAndSendOtp, verifyOtp, MAX_ATTEMPTS };
