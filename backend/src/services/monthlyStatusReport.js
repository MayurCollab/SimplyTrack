const moment = require('moment-timezone');
const Task = require('../models/Task');
const {
  MONTHLY_REPORT_COLUMN_KEYS,
  DEFAULT_MONTHLY_REPORT_COLUMNS,
} = require('../constants/monthlyReportColumns');

function normalizeTimezone(tz) {
  if (!tz) return 'Asia/Kolkata';
  if (tz === 'Asia/Calcutta') return 'Asia/Kolkata';
  return tz;
}

function resolveSelectedColumns(selected) {
  const list = Array.isArray(selected) ? selected : [];
  const filtered = list.filter((key) => MONTHLY_REPORT_COLUMN_KEYS.includes(key));
  return filtered.length > 0 ? filtered : [...DEFAULT_MONTHLY_REPORT_COLUMNS];
}

function monthBounds(periodKey, timezone) {
  const tz = normalizeTimezone(timezone);
  const start = moment.tz(`${periodKey}-01`, 'YYYY-MM-DD', tz).startOf('month');
  const end = start.clone().endOf('month');
  return { start: start.toDate(), end: end.toDate(), tz };
}

function currentPeriodKey(timezone) {
  return moment.tz(normalizeTimezone(timezone)).format('YYYY-MM');
}

function formatDate(value, timezone) {
  if (!value) return '';
  return moment(value).tz(normalizeTimezone(timezone)).format('DD/MM/YYYY');
}

function formatDateTime(value, timezone) {
  if (!value) return '';
  return moment(value).tz(normalizeTimezone(timezone)).format('DD/MM/YYYY HH:mm');
}

function lifecycleOf(task) {
  if (task.completedAt) return 'Completed';
  if (task.ignoredAt) return 'Ignored';
  return 'Open';
}

function rowValue(task, key, timezone) {
  switch (key) {
    case 'taskCode':
      return task.taskCode || '';
    case 'title':
      return task.title || '';
    case 'client':
      return task.clientId?.organizationName || '';
    case 'service':
      return task.serviceId?.name || '';
    case 'assignee':
      return task.assigneeId?.name || '';
    case 'helpingMember':
      return task.helpingMemberId?.name || '';
    case 'manager':
      return task.managerId?.name || 'No manager';
    case 'status':
      return task.stageId?.name || '';
    case 'priority':
      return task.priority || '';
    case 'dueDate':
      return formatDate(task.dueDate, timezone);
    case 'targetDate':
      return formatDate(task.targetDate, timezone);
    case 'lifecycle':
      return lifecycleOf(task);
    case 'completedAt':
      return formatDateTime(task.completedAt, timezone);
    case 'ignoredAt':
      return formatDateTime(task.ignoredAt, timezone);
    case 'budgetHours':
      return task.budgetHours ?? '';
    case 'loggedHours':
      return task.totalLoggedMinutes != null
        ? Math.round((task.totalLoggedMinutes / 60) * 100) / 100
        : '';
    default:
      return '';
  }
}

/**
 * Option A: all open tasks + tasks completed/ignored during the month.
 */
async function fetchReportTasks(organizationId, periodKey, timezone) {
  const { start, end } = monthBounds(periodKey, timezone);

  const tasks = await Task.find({
    organizationId,
    $or: [
      { completedAt: null, ignoredAt: null },
      { completedAt: { $gte: start, $lte: end } },
      { ignoredAt: { $gte: start, $lte: end } },
    ],
  })
    .populate('clientId', 'organizationName')
    .populate('serviceId', 'name')
    .populate('assigneeId', 'name email isActive')
    .populate('helpingMemberId', 'name email')
    .populate('managerId', 'name email isActive')
    .populate('stageId', 'name color systemKey')
    .sort({ 'managerId': 1, 'assigneeId': 1, dueDate: 1 })
    .lean();

  return tasks;
}

function buildGroupedRows(tasks) {
  const managers = new Map();

  for (const task of tasks) {
    const managerId = task.managerId?._id ? String(task.managerId._id) : 'none';
    const managerName = task.managerId?.name || 'No manager';
    const assigneeId = task.assigneeId?._id ? String(task.assigneeId._id) : 'none';
    const assigneeName = task.assigneeId?.name || 'Unassigned';

    if (!managers.has(managerId)) {
      managers.set(managerId, {
        managerId,
        managerName,
        members: new Map(),
      });
    }

    const manager = managers.get(managerId);
    if (!manager.members.has(assigneeId)) {
      manager.members.set(assigneeId, {
        assigneeId,
        assigneeName,
        tasks: [],
      });
    }

    manager.members.get(assigneeId).tasks.push(task);
  }

  const groups = [...managers.values()]
    .map((m) => ({
      managerId: m.managerId,
      managerName: m.managerName,
      members: [...m.members.values()].sort((a, b) =>
        a.assigneeName.localeCompare(b.assigneeName)
      ),
    }))
    .sort((a, b) => {
      if (a.managerId === 'none') return 1;
      if (b.managerId === 'none') return -1;
      return a.managerName.localeCompare(b.managerName);
    });

  return groups;
}

function buildSummary(tasks, groups) {
  const byStatus = {};
  const byLifecycle = { Open: 0, Completed: 0, Ignored: 0 };
  const byManager = [];

  for (const task of tasks) {
    const status = task.stageId?.name || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    byLifecycle[lifecycleOf(task)] += 1;
  }

  for (const group of groups) {
    let open = 0;
    let completed = 0;
    let ignored = 0;
    let taskCount = 0;
    for (const member of group.members) {
      for (const task of member.tasks) {
        taskCount += 1;
        const life = lifecycleOf(task);
        if (life === 'Open') open += 1;
        else if (life === 'Completed') completed += 1;
        else ignored += 1;
      }
    }
    byManager.push({
      managerName: group.managerName,
      memberCount: group.members.length,
      taskCount,
      open,
      completed,
      ignored,
    });
  }

  return {
    totalTasks: tasks.length,
    byStatus,
    byLifecycle,
    byManager,
  };
}

async function buildMonthlySnapshot({
  organizationId,
  periodKey,
  timezone,
  selectedColumns,
}) {
  const tz = normalizeTimezone(timezone);
  const columns = resolveSelectedColumns(selectedColumns);
  const tasks = await fetchReportTasks(organizationId, periodKey, tz);
  const groups = buildGroupedRows(tasks);
  const summary = buildSummary(tasks, groups);
  const generatedAt = new Date();

  return {
    organizationId,
    periodKey,
    timezone: tz,
    selectedColumns: columns,
    generatedAt,
    tasks,
    groups,
    summary,
    rows: tasks.map((task) => {
      const row = {};
      for (const key of columns) {
        row[key] = rowValue(task, key, tz);
      }
      return {
        managerId: task.managerId?._id ? String(task.managerId._id) : 'none',
        managerName: task.managerId?.name || 'No manager',
        assigneeId: task.assigneeId?._id ? String(task.assigneeId._id) : 'none',
        assigneeName: task.assigneeId?.name || 'Unassigned',
        values: row,
      };
    }),
  };
}

module.exports = {
  normalizeTimezone,
  resolveSelectedColumns,
  monthBounds,
  currentPeriodKey,
  formatDate,
  formatDateTime,
  buildMonthlySnapshot,
  rowValue,
};
