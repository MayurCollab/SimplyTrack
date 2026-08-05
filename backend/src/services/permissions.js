const Permission = require('../models/Permission');
const { MODULES } = require('../models/Permission');

const FULL = {
  view: true,
  add: true,
  edit: true,
  delete: true,
  editBudgetHours: true,
  editLoggedTime: true,
};

const OWNER_DEFAULTS = Object.fromEntries(MODULES.map((m) => [m, { ...FULL }]));

const MANAGER_DEFAULTS = {
  tasks: { view: true, add: true, edit: true, delete: false, editBudgetHours: true, editLoggedTime: true },
  clients: { view: true, add: true, edit: true, delete: false, editBudgetHours: false, editLoggedTime: false },
  users: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  services: { view: true, add: true, edit: true, delete: false, editBudgetHours: false, editLoggedTime: false },
  projects: { view: true, add: true, edit: true, delete: false, editBudgetHours: false, editLoggedTime: false },
  stages: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  reports: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  permissions: { view: false, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  settings: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
};

const STAFF_DEFAULTS = {
  tasks: { view: true, add: true, edit: true, delete: false, editBudgetHours: false, editLoggedTime: false },
  clients: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  users: { view: false, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  services: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  projects: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  stages: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  reports: { view: true, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  permissions: { view: false, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
  settings: { view: false, add: false, edit: false, delete: false, editBudgetHours: false, editLoggedTime: false },
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

module.exports = { seedDefaultPermissions };
