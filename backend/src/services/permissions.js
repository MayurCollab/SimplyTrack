const Permission = require('../models/Permission');
const { MODULES } = require('../models/Permission');

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
};

const OWNER_DEFAULTS = Object.fromEntries(MODULES.map((m) => [m, { ...FULL }]));

const MANAGER_DEFAULTS = {
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
  },
  clients: { ...VIEW_ONLY, add: true, edit: true },
  users: { ...VIEW_ONLY },
  services: { ...VIEW_ONLY, add: true, edit: true },
  projects: { ...VIEW_ONLY, add: true, edit: true },
  stages: { ...VIEW_ONLY },
  closing_note_stages: { ...VIEW_ONLY },
  alerts: { ...VIEW_ONLY },
  reports: { ...VIEW_ONLY },
  permissions: { ...NONE },
  settings: { ...VIEW_ONLY },
};

const STAFF_DEFAULTS = {
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
}

async function ensurePermissionsForOrg(organizationId) {
  for (const role of ['owner', 'manager', 'staff']) {
    for (const module of MODULES) {
      const actions = ROLE_DEFAULTS[role][module] || { ...NONE };
      await Permission.updateOne(
        { organizationId, role, module },
        { $setOnInsert: { organizationId, role, module, actions } },
        { upsert: true }
      );
    }
  }
}

module.exports = { seedDefaultPermissions, ensurePermissionsForOrg, MODULES };
