const Organization = require('../models/Organization');
const Task = require('../models/Task');
const ServiceMaster = require('../models/ServiceMaster');
const ClientMaster = require('../models/ClientMaster');
const Permission = require('../models/Permission');
const { MODULES } = require('../models/Permission');
const { seedDefaultStages } = require('./stages');
const { seedDefaultAlerts } = require('./alerts');
const { ensurePermissionsForOrg } = require('./permissions');
const { generateTaskCode } = require('./taskCode');
const {
  inferCompliancePeriodInput,
  formatCompliancePeriodValue,
  buildTaskTitle,
} = require('./taskTitle');
const { computeTargetDate } = require('./targetDate');

const MANAGER_TASK_ACTIONS = {
  complete: true,
  ignore: true,
  editTargetDate: true,
};

async function migratePermissions() {
  for (const module of MODULES) {
    await Permission.updateMany(
      { role: 'manager', module: 'tasks' },
      {
        $set: {
          'actions.complete': MANAGER_TASK_ACTIONS.complete,
          'actions.ignore': MANAGER_TASK_ACTIONS.ignore,
          'actions.editTargetDate': MANAGER_TASK_ACTIONS.editTargetDate,
        },
      }
    );
    await Permission.updateMany(
      { role: 'owner', module },
      {
        $set: {
          'actions.complete': true,
          'actions.ignore': true,
          'actions.editTargetDate': true,
        },
      }
    );
    await Permission.updateMany(
      { role: 'staff', module: 'tasks' },
      {
        $set: {
          'actions.complete': false,
          'actions.ignore': false,
          'actions.editTargetDate': false,
        },
      }
    );
  }
}

async function migrateServiceDefaults() {
  await ServiceMaster.updateMany(
    {
      $or: [
        { turnaroundBusinessDays: { $exists: false } },
        { turnaroundBusinessDays: null },
      ],
    },
    { $set: { turnaroundBusinessDays: 3 } }
  );
  await ServiceMaster.updateMany(
    {
      $or: [
        { compliancePeriodType: { $exists: false } },
        { compliancePeriodType: null },
        { compliancePeriodType: '' },
      ],
    },
    { $set: { compliancePeriodType: 'due_date' } }
  );
}

async function migrateOrgTasks(orgId) {
  await seedDefaultStages(orgId);

  const tasksWithoutCode = await Task.find({
    organizationId: orgId,
    $or: [{ taskCode: { $exists: false } }, { taskCode: null }, { taskCode: '' }],
  })
    .sort({ createdAt: 1 })
    .select('_id');

  for (const task of tasksWithoutCode) {
    const taskCode = await generateTaskCode(orgId);
    await Task.updateOne({ _id: task._id }, { $set: { taskCode } });
  }

  const legacyTasks = await Task.find({
    organizationId: orgId,
    $or: [
      { taskReceiveDate: null },
      { compliancePeriodInput: { $in: [null, ''] } },
      { compliancePeriodValue: { $in: [null, ''] } },
      { targetDate: null },
    ],
  }).select(
    '_id dueDate createdAt serviceId clientId title taskReceiveDate compliancePeriodInput compliancePeriodValue targetDate'
  );

  for (const task of legacyTasks) {
    const updates = {};
    const service = await ServiceMaster.findById(task.serviceId).lean();

    if (!task.taskReceiveDate) {
      updates.taskReceiveDate = task.createdAt || new Date();
    }

    const receive = updates.taskReceiveDate || task.taskReceiveDate;

    if (!task.compliancePeriodInput) {
      updates.compliancePeriodInput = inferCompliancePeriodInput(task, service);
    }

    const periodInput = updates.compliancePeriodInput || task.compliancePeriodInput;
    if (periodInput && !task.compliancePeriodValue) {
      updates.compliancePeriodValue = formatCompliancePeriodValue(
        periodInput,
        service?.compliancePeriodType || 'due_date'
      );
    }

    if (!task.targetDate && receive) {
      updates.targetDate = computeTargetDate(
        receive,
        service?.turnaroundBusinessDays ?? 3
      );
    }

    const periodValue = updates.compliancePeriodValue || task.compliancePeriodValue;
    if (periodValue && (!task.title || task.title.trim() === '')) {
      const client = await ClientMaster.findById(task.clientId).lean();
      if (client && service) {
        updates.title = buildTaskTitle(client.organizationName, service.name, periodValue);
      }
    }

    if (Object.keys(updates).length > 0) {
      await Task.updateOne({ _id: task._id }, { $set: updates });
    }
  }

  // Sync org taskSequence to at least the highest existing numeric suffix
  const coded = await Task.find({
    organizationId: orgId,
    taskCode: { $regex: /^TSK-\d+$/ },
  })
    .select('taskCode')
    .lean();

  let maxSeq = 0;
  for (const t of coded) {
    const n = parseInt(String(t.taskCode).replace(/^TSK-/, ''), 10);
    if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
  }

  if (maxSeq > 0) {
    const org = await Organization.findById(orgId).select('taskSequence');
    if (org && (org.taskSequence || 0) < maxSeq) {
      org.taskSequence = maxSeq;
      await org.save();
    }
  }
}

async function migrateSettingsDefaults() {
  const Settings = require('../models/Settings');
  const { DEFAULT_MONTHLY_REPORT_COLUMNS } = require('../constants/monthlyReportColumns');

  await Settings.updateMany(
    {
      $or: [
        { defaultTimezone: { $exists: false } },
        { defaultTimezone: null },
        { defaultTimezone: '' },
        { defaultTimezone: 'Asia/Calcutta' },
      ],
    },
    { $set: { defaultTimezone: 'Asia/Kolkata' } }
  );

  await Settings.updateMany(
    { monthlyStatusReport: { $exists: false } },
    {
      $set: {
        monthlyStatusReport: {
          enabled: false,
          sendTime: '23:55',
          recipientUserIds: [],
          externalEmails: [],
          selectedColumns: DEFAULT_MONTHLY_REPORT_COLUMNS,
          lastSuccessPeriodKey: '',
        },
      },
    }
  );

  await Settings.updateMany(
    {
      $or: [
        { 'monthlyStatusReport.sendTime': { $exists: false } },
        { 'monthlyStatusReport.sendTime': null },
        { 'monthlyStatusReport.sendTime': '' },
      ],
    },
    { $set: { 'monthlyStatusReport.sendTime': '23:55' } }
  );

  await Settings.updateMany(
    {
      $or: [
        { 'monthlyStatusReport.selectedColumns': { $exists: false } },
        { 'monthlyStatusReport.selectedColumns': { $size: 0 } },
      ],
    },
    { $set: { 'monthlyStatusReport.selectedColumns': DEFAULT_MONTHLY_REPORT_COLUMNS } }
  );
}

async function runStartupMigrations() {
  await migratePermissions();
  await migrateServiceDefaults();
  await migrateSettingsDefaults();

  const orgs = await Organization.find({}).select('_id').lean();
  for (const org of orgs) {
    await ensurePermissionsForOrg(org._id);
    await seedDefaultAlerts(org._id);
    await migrateOrgTasks(org._id);
  }
}

module.exports = { runStartupMigrations };
