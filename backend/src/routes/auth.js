const express = require('express');
const {
  register,
  login,
  verifyOtpHandler,
  refresh,
  logout,
  me,
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { otpRequestLimiter, otpVerifyLimiter } = require('../middleware/rateLimiter');
const {
  validate,
  registerSchema,
  loginSchema,
  verifyOtpSchema,
} = require('../utils/validation');

const router = express.Router();

router.post('/register', otpRequestLimiter, validate(registerSchema), register);
router.post('/login', otpRequestLimiter, validate(loginSchema), login);
router.post('/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), verifyOtpHandler);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);

module.exports = router;
