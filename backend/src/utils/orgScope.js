function getOrgId(user) {
  if (!user?.organizationId) return null;
  return user.organizationId;
}

function requireOrg(user) {
  const orgId = getOrgId(user);
  if (!orgId && user?.role !== 'super_admin') {
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

module.exports = { getOrgId, requireOrg, orgFilter };
