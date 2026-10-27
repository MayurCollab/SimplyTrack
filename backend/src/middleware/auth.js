const Organization = require('../models/Organization');
const User = require('../models/User');
const { verifyAccessToken } = require('../services/token');
const { organizationBlockMessage } = require('../services/platformAccess');

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub).select('-__v');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or inactive user' });
    }

    const block = await organizationBlockMessage(user);
    if (block) {
      return res.status(403).json({ message: block });
    }

    if (user.isSuperAdmin && decoded.actingOrganizationId) {
      const actingOrg = await Organization.findById(decoded.actingOrganizationId).select('_id');
      if (actingOrg) {
        user.$locals.actingOrganizationId = String(actingOrg._id);
      }
    }

    req.user = user;
    req.auth = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = { authMiddleware };
