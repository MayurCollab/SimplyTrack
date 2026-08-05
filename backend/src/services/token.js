const jwt = require('jsonwebtoken');
const config = require('../config/env');

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

function signAccessToken(payload) {
  return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: ACCESS_TTL });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: REFRESH_TTL });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtAccessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwtRefreshSecret);
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: !config.isDev,
    sameSite: config.isDev ? 'lax' : 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: !config.isDev,
    sameSite: config.isDev ? 'lax' : 'none',
    path: '/api/auth',
  });
}

function authPayload(user) {
  return {
    sub: user._id.toString(),
    role: user.role,
    organizationId: user.organizationId ? user.organizationId.toString() : null,
    email: user.email,
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  authPayload,
};
