const rateLimit = require('express-rate-limit');

const otpRequestLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const email = (req.body?.email || '').toLowerCase().trim();
    return email || req.ip || 'unknown';
  },
  message: { message: 'Please wait 30 seconds before requesting another OTP.' },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many verification attempts. Try again later.' },
});

module.exports = { otpRequestLimiter, otpVerifyLimiter };
