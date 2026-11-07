const Permission = require('../models/Permission');
const { MODULES } = require('../models/Permission');
const { invalidateOrgPermissions } = require('./permissionCache');

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

const VIEW_ONLY = {
  view: true,
  add: false,
  edit: false,
  delete: false,
  editBudgetHours: false,
  editLoggedTime: false,
  complete: false,
  ignore: false,
  editTargetDate: false,
  saveTaskDescription: false,
  editTaskDescription: false,
};

const NONE = {
  view: false,
  add: false,
  edit: false,
  delete: false,
  editBudgetHours: false,
  editLoggedTime: false,
  complete: false,
  ignore: false,
  editTargetDate: false,
  saveTaskDescription: false,
  editTaskDescription: false,
};

const OWNER_DEFAULTS = Object.fromEntries(MODULES.map((m) => [m, { ...FULL }]));

const MANAGER_DEFAULTS = {
  dashboard: { ...VIEW_ONLY },
  tasks: {
    view: true,
    add: true,
    edit: true,
    delete: false,
    editBudgetHours: true,
    editLoggedTime: true,
    complete: true,
    ignore: true,
    editTargetDate: true,
    saveTaskDescription: true,
    editTaskDescription: true,
  },
  clients: { ...VIEW_ONLY, add: true, edit: true, delete: true },
  users: { ...VIEW_ONLY },
  services: { ...VIEW_ONLY, add: true, edit: true },
  projects: { ...VIEW_ONLY, add: true, edit: true },
  stages: { ...VIEW_ONLY },
  closing_note_stages: { ...VIEW_ONLY },
  alerts: { ...VIEW_ONLY },
  reports: { ...VIEW_ONLY },
  permissions: { ...NONE },
  settings: { ...VIEW_ONLY },
  team_status: { ...VIEW_ONLY },
  time_adjustments: { ...VIEW_ONLY },
  timelogs: { ...VIEW_ONLY, add: true, edit: true },
  notifications: { ...VIEW_ONLY, edit: true, delete: true },
  task_share_requests: { ...VIEW_ONLY, add: true, edit: true },
};

const STAFF_DEFAULTS = {
  dashboard: { ...VIEW_ONLY },
  tasks: {
    view: true,
    add: true,
    edit: true,
    delete: false,
    editBudgetHours: false,
    editLoggedTime: false,
    complete: false,
    ignore: false,
    editTargetDate: false,
    saveTaskDescription: true,
    editTaskDescription: false,
  },
  clients: { ...VIEW_ONLY },
  users: { ...NONE },
  services: { ...VIEW_ONLY },
  projects: { ...VIEW_ONLY },
  stages: { ...VIEW_ONLY },
  closing_note_stages: { ...VIEW_ONLY },
  alerts: { ...VIEW_ONLY },
  reports: { ...VIEW_ONLY },
  permissions: { ...NONE },
  settings: { ...NONE },
  team_status: { ...NONE },
  time_adjustments: { ...NONE, add: true },
  timelogs: { ...VIEW_ONLY, add: true },
  notifications: { ...VIEW_ONLY, edit: true, delete: true },
  task_share_requests: { ...VIEW_ONLY, add: true },
};

const ROLE_DEFAULTS = {
  owner: OWNER_DEFAULTS,
  manager: MANAGER_DEFAULTS,
  staff: STAFF_DEFAULTS,
};

async function seedDefaultPermissions(organizationId) {
  const docs = [];

  for (const module of MODULES) {
    docs.push({
      organizationId,
      role: 'owner',
      module,
      actions: OWNER_DEFAULTS[module],
    });
    docs.push({
      organizationId,
      role: 'manager',
      module,
      actions: MANAGER_DEFAULTS[module],
    });
    docs.push({
      organizationId,
      role: 'staff',
      module,
      actions: STAFF_DEFAULTS[module],
    });
  }

  await Permission.insertMany(docs);
  invalidateOrgPermissions(organizationId);
}

async function ensurePermissionsForOrg(organizationId) {
  const ops = [];
  for (const role of ['owner', 'manager', 'staff']) {
    for (const module of MODULES) {
      const actions = ROLE_DEFAULTS[role][module] || { ...NONE };
      ops.push({
        updateOne: {
          filter: { organizationId, role, module },
          update: { $setOnInsert: { organizationId, role, module, actions } },
          upsert: true,
        },
      });
    }
  }
  if (ops.length) {
    await Permission.bulkWrite(ops, { ordered: false });
  }
  invalidateOrgPermissions(organizationId);
}

module.exports = {
  seedDefaultPermissions,
  ensurePermissionsForOrg,
  MODULES,
  ROLE_DEFAULTS,
};
