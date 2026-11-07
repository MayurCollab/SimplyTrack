const mongoose = require('mongoose');

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const str = String(value);
  if (!mongoose.Types.ObjectId.isValid(str)) return null;
  return new mongoose.Types.ObjectId(str);
}

function getOrgId(user) {
  const acting = user?.$locals?.actingOrganizationId;
  if (user?.isSuperAdmin && acting) {
    return toObjectId(acting);
  }
  if (!user?.organizationId) return null;
  return toObjectId(user.organizationId);
}

function requireOrg(user) {
  const orgId = getOrgId(user);
  if (!orgId) {
    const err = new Error('No organization context');
    err.status = 403;
    throw err;
  }
  return orgId;
}

function orgFilter(user) {
  const orgId = requireOrg(user);
  return { organizationId: orgId };
}

module.exports = { getOrgId, requireOrg, orgFilter, toObjectId };
