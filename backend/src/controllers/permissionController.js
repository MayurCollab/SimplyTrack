const Permission = require('../models/Permission');
const { MODULES } = require('../models/Permission');
const { orgFilter } = require('../utils/orgScope');

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
};

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

    const permissions = await Permission.find({
      organizationId: user.organizationId,
      role: user.role,
    }).lean();

    const map = {};
    for (const p of permissions) {
      map[p.module] = p.actions;
    }

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

    const updated = [];
    for (const item of items) {
      if (!item?.role || !item?.module || !MODULES.includes(item.module)) continue;
      if (!['manager', 'staff'].includes(item.role)) continue;

      const existing = await Permission.findOne({
        organizationId: orgId,
        role: item.role,
        module: item.module,
      });
      if (!existing) continue;

      const nextActions = { ...existing.actions };
      for (const key of ACTION_KEYS) {
        if (typeof item.actions?.[key] === 'boolean') {
          nextActions[key] = item.actions[key];
        }
      }
      existing.actions = nextActions;
      await existing.save();
      updated.push(existing.toObject());
    }

    res.json({ data: updated, message: 'Permissions updated' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyPermissions, list, update };
