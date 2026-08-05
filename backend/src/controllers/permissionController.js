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
};

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
    res.json({ data: permissions });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyPermissions, list };
