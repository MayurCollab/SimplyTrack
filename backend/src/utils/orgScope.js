function getOrgId(user) {
  const acting = user?.$locals?.actingOrganizationId;
  if (user?.isSuperAdmin && acting) return acting;
  if (!user?.organizationId) return null;
  return user.organizationId;
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

module.exports = { getOrgId, requireOrg, orgFilter };
