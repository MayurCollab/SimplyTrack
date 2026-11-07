const Permission = require('../models/Permission');
const { MODULES } = require('../models/Permission');
const { orgFilter } = require('../utils/orgScope');
const {
  FULL,
  getRolePermissionMap,
  invalidateOrgPermissions,
} = require('../services/permissionCache');

const ACTION_KEYS = Object.keys(FULL);

function fullAccessMap() {
  return Object.fromEntries(MODULES.map((m) => [m, { ...FULL }]));
}

async function getMyPermissions(req, res, next) {
  try {
    const user = req.user;

    if (user.role === 'super_admin' || user.role === 'owner') {
      return res.json({ data: fullAccessMap() });
    }

    const map = await getRolePermissionMap(user.organizationId, user.role);
    res.json({ data: map });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const permissions = await Permission.find(orgFilter(req.user))
      .sort({ role: 1, module: 1 })
      .lean();
    res.json({ data: permissions, modules: MODULES, actions: ACTION_KEYS });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    const ops = [];
    const touched = [];

    for (const item of items) {
      if (!item?.role || !item?.module || !MODULES.includes(item.module)) continue;
      if (!['manager', 'staff'].includes(item.role)) continue;

      const setFields = {};
      for (const key of ACTION_KEYS) {
        if (typeof item.actions?.[key] === 'boolean') {
          setFields[`actions.${key}`] = item.actions[key];
        }
      }
      if (!Object.keys(setFields).length) continue;

      ops.push({
        updateOne: {
          filter: { organizationId: orgId, role: item.role, module: item.module },
          update: { $set: setFields },
        },
      });
      touched.push({ role: item.role, module: item.module });
    }

    if (ops.length) {
      await Permission.bulkWrite(ops, { ordered: false });
      invalidateOrgPermissions(orgId);
    }

    const updated = touched.length
      ? await Permission.find({
          organizationId: orgId,
          $or: touched.map((t) => ({ role: t.role, module: t.module })),
        }).lean()
      : [];

    res.json({ data: updated, message: 'Permissions updated' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyPermissions, list, update };
