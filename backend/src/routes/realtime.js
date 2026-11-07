const express = require('express');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { verifyAccessToken } = require('../services/token');
const { organizationBlockMessage } = require('../services/platformAccess');
const { registerClient } = require('../services/realtime');

const router = express.Router();

/**
 * SSE stream. EventSource cannot set Authorization headers, so the access
 * token is accepted via ?access_token=… (same JWT as /api Bearer).
 */
router.get('/stream', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.query.access_token || null;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(String(token));
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const user = await User.findById(decoded.sub)
      .select('name email role organizationId isActive isSuperAdmin')
      .lean();

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or inactive user' });
    }

    const reqUser = { ...user, $locals: {} };
    if (user.isSuperAdmin && decoded.actingOrganizationId) {
      const actingOrg = await Organization.findById(decoded.actingOrganizationId)
        .select('_id')
        .lean();
      if (actingOrg) {
        reqUser.$locals.actingOrganizationId = String(actingOrg._id);
      }
    }

    const block = await organizationBlockMessage(reqUser);
    if (block) {
      return res.status(403).json({ message: block });
    }

    const organizationId = reqUser.$locals?.actingOrganizationId
      ? reqUser.$locals.actingOrganizationId
      : user.isSuperAdmin
        ? null
        : user.organizationId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    registerClient({
      res,
      userId: user._id,
      organizationId,
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ message: err.message || 'Realtime stream failed' });
    }
  }
});

module.exports = router;
