const Organization = require('../models/Organization');
const User = require('../models/User');
const { verifyAccessToken } = require('../services/token');
const { organizationBlockMessage } = require('../services/platformAccess');
const { createTtlCache } = require('../utils/ttlCache');

const userAuthCache = createTtlCache({ ttlMs: 30_000, maxSize: 500 });
const actingOrgCache = createTtlCache({ ttlMs: 60_000, maxSize: 200 });

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = verifyAccessToken(token);
    const cacheKey = String(decoded.sub);
    let user = userAuthCache.get(cacheKey);
    if (!user) {
      user = await User.findById(decoded.sub)
        .select('name email role organizationId isActive isSuperAdmin reportingManagerId')
        .lean();
      if (user) userAuthCache.set(cacheKey, user);
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or inactive user' });
    }

    const block = await organizationBlockMessage(user);
    if (block) {
      return res.status(403).json({ message: block });
    }

    // Attach mutable locals for acting-org without mutating the cached object
    const reqUser = { ...user, $locals: {} };

    if (user.isSuperAdmin && decoded.actingOrganizationId) {
      const actingKey = String(decoded.actingOrganizationId);
      let actingId = actingOrgCache.get(actingKey);
      if (actingId === undefined) {
        const actingOrg = await Organization.findById(decoded.actingOrganizationId)
          .select('_id')
          .lean();
        actingId = actingOrg ? String(actingOrg._id) : null;
        actingOrgCache.set(actingKey, actingId);
      }
      if (actingId) {
        reqUser.$locals.actingOrganizationId = actingId;
      }
    }

    req.user = reqUser;
    req.auth = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = { authMiddleware };
