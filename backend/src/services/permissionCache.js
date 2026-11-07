const Permission = require('../models/Permission');
const { createTtlCache } = require('../utils/ttlCache');

const FULL = {
  view: true,
  add: true,
  edit: true,
  delete: true,
  editBudgetHours: true,
  editLoggedTime: true,
  complete: true,
  ignore: true,
  editTargetDate: true,
  saveTaskDescription: true,
  editTaskDescription: true,
};

/** Cache all module actions for a role: key = `${orgId}:${role}` */
const rolePermCache = createTtlCache({ ttlMs: 60_000, maxSize: 500 });

function cacheKey(organizationId, role) {
  return `${organizationId}:${role}`;
}

function invalidateOrgPermissions(organizationId) {
  if (!organizationId) {
    rolePermCache.clear();
    return;
  }
  const prefix = `${organizationId}:`;
  for (const role of ['owner', 'manager', 'staff']) {
    rolePermCache.del(`${prefix}${role}`);
  }
}

/**
 * Returns a map of module -> actions for the given org+role.
 * Owner/super_admin callers should not need this (bypass earlier).
 */
async function getRolePermissionMap(organizationId, role) {
  if (!organizationId || !role) return {};

  const key = cacheKey(organizationId, role);
  const cached = rolePermCache.get(key);
  if (cached) return cached;

  const rows = await Permission.find({ organizationId, role })
    .select('module actions')
    .lean();

  const map = {};
  for (const row of rows) {
    map[row.module] = row.actions || {};
  }
  rolePermCache.set(key, map);
  return map;
}

async function getModuleActions(organizationId, role, module) {
  const map = await getRolePermissionMap(organizationId, role);
  return map[module] || null;
}

async function hasPermission(user, module, action) {
  if (!user) return false;
  if (user.role === 'super_admin' || user.role === 'owner') return true;
  if (!user.organizationId) return false;
  const actions = await getModuleActions(user.organizationId, user.role, module);
  return Boolean(actions?.[action]);
}

module.exports = {
  FULL,
  getRolePermissionMap,
  getModuleActions,
  hasPermission,
  invalidateOrgPermissions,
};
