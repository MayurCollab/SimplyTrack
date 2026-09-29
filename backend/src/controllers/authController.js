const Organization = require('../models/Organization');
const User = require('../models/User');
const Settings = require('../models/Settings');
const config = require('../config/env');
const { createAndSendOtp, verifyOtp } = require('../services/otp');
const { seedDefaultPermissions } = require('../services/permissions');
const { seedDefaultStages } = require('../services/stages');
const { seedDefaultAlerts } = require('../services/alerts');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  authPayload,
} = require('../services/token');

async function register(req, res, next) {
  try {
    const { orgName, name, email } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const organization = await Organization.create({
      name: orgName,
      isActive: true,
    });

    const user = await User.create({
      organizationId: organization._id,
      name,
      email,
      role: 'owner',
      isActive: true,
    });

    organization.ownerId = user._id;
    await organization.save();

    await Settings.create({
      organizationId: organization._id,
      defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    await seedDefaultPermissions(organization._id);
    await seedDefaultStages(organization._id);
    await seedDefaultAlerts(organization._id);

    const otpResult = await createAndSendOtp({
      email,
      purpose: 'register',
      name,
      meta: {
        pendingOrgId: organization._id,
        pendingUserId: user._id,
        orgName,
        name,
      },
    });

    if (config.isDev && otpResult.devOtp) {
      console.log(`\n>>> REGISTER OTP for ${email}: ${otpResult.devOtp}\n`);
    }

    res.status(201).json({
      message: 'Registration started. Check your email for the OTP.',
      email,
      purpose: 'register',
      ...(config.isDev && otpResult.devOtp ? { devOtp: otpResult.devOtp } : {}),
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'No active account found for this email' });
    }

    const otpResult = await createAndSendOtp({
      email,
      purpose: 'login',
      name: user.name,
    });

    if (config.isDev && otpResult.devOtp) {
      console.log(`\n>>> LOGIN OTP for ${email}: ${otpResult.devOtp}\n`);
    }

    res.json({
      message: 'OTP sent to your email.',
      email,
      purpose: 'login',
      ...(config.isDev && otpResult.devOtp ? { devOtp: otpResult.devOtp } : {}),
    });
  } catch (err) {
    next(err);
  }
}

async function verifyOtpHandler(req, res, next) {
  try {
    const { email, otp, purpose } = req.body;
    const result = await verifyOtp({ email, purpose, otp });

    if (!result.ok) {
      return res.status(400).json({ message: result.error });
    }

    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'User not found or inactive' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const payload = authPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setRefreshCookie(res, refreshToken);

    const organization = user.organizationId
      ? await Organization.findById(user.organizationId).select('name isActive')
      : null;

    res.json({
      message: 'Verified successfully',
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: organization?.name || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: 'Refresh token missing' });
    }

    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.sub);

    if (!user || !user.isActive) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const payload = authPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setRefreshCookie(res, refreshToken);

    res.json({ accessToken });
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}

async function logout(req, res) {
  clearRefreshCookie(res);
  res.json({ message: 'Logged out' });
}

async function me(req, res, next) {
  try {
    const user = req.user;
    const organization = user.organizationId
      ? await Organization.findById(user.organizationId).select('name isActive')
      : null;

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: organization?.name || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  verifyOtpHandler,
  refresh,
  logout,
  me,
};
