const mongoose = require('mongoose');

const MODULES = [
  'tasks',
  'clients',
  'users',
  'services',
  'projects',
  'stages',
  'closing_note_stages',
  'alerts',
  'reports',
  'permissions',
  'settings',
];

const permissionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    role: { type: String, enum: ['owner', 'manager', 'staff'], required: true },
    module: { type: String, enum: MODULES, required: true },
    actions: {
      view: { type: Boolean, default: false },
      add: { type: Boolean, default: false },
      edit: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      editBudgetHours: { type: Boolean, default: false },
      editLoggedTime: { type: Boolean, default: false },
      complete: { type: Boolean, default: false },
      ignore: { type: Boolean, default: false },
      editTargetDate: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

permissionSchema.index({ organizationId: 1, role: 1, module: 1 }, { unique: true });

module.exports = mongoose.model('Permission', permissionSchema);
module.exports.MODULES = MODULES;
