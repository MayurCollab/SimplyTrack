const moment = require('moment-timezone');
const Task = require('../models/Task');
const Organization = require('../models/Organization');
const TaskDailySnapshot = require('../models/TaskDailySnapshot');
const {
  DEFAULT_MONTHLY_REPORT_COLUMNS,
  MONTHLY_REPORT_COLUMNS,
} = require('../constants/monthlyReportColumns');
const { normalizeTimezone } = require('./monthlyStatusReport');

const JOB_TIMEZONE = 'Asia/Kolkata';

const COLUMN_LABELS = Object.fromEntries(
  MONTHLY_REPORT_COLUMNS.map((c) => [c.key, c.label])
);

function istDateKey(now = moment.tz(JOB_TIMEZONE)) {
  return now.clone().tz(JOB_TIMEZONE).format('YYYY-MM-DD');
}

/** Calendar day that just ended when midnight cron fires (previous IST day). */
function previousIstDateKey(now = moment.tz(JOB_TIMEZONE)) {
  return now.clone().tz(JOB_TIMEZONE).subtract(1, 'day').format('YYYY-MM-DD');
}

function lifecycleOf(task) {
  if (task.completedAt) return 'Completed';
  if (task.ignoredAt) return 'Ignored';
  return 'Open';
}

function toRow(task) {
  const loggedHours =
    task.totalLoggedMinutes != null
      ? Math.round((task.totalLoggedMinutes / 60) * 100) / 100
      : null;

  return {
    taskId: task._id,
    taskCode: task.taskCode || '',
    title: task.title || '',
    clientName: task.clientId?.organizationName || '',
    serviceName: task.serviceId?.name || '',
    assigneeId: task.assigneeId?._id || task.assigneeId || null,
    assigneeName: task.assigneeId?.name || '',
    helpingMemberName: task.helpingMemberId?.name || '',
    managerId: task.managerId?._id || task.managerId || null,
    managerName: task.managerId?.name || 'No manager',
    stageName: task.stageId?.name || '',
    priority: task.priority || '',
    dueDate: task.dueDate || null,
    targetDate: task.targetDate || null,
    lifecycle: lifecycleOf(task),
    completedAt: task.completedAt || null,
    ignoredAt: task.ignoredAt || null,
    budgetHours: task.budgetHours ?? null,
    loggedHours,
  };
}

function buildSummary(rows) {
  const byStatus = {};
  let open = 0;
  let completed = 0;
  let ignored = 0;

  for (const row of rows) {
    if (row.lifecycle === 'Open') open += 1;
    else if (row.lifecycle === 'Completed') completed += 1;
    else ignored += 1;
    const status = row.stageName || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  return {
    open,
    working: open,
    completed,
    ignored,
    byStatus,
  };
}

/**
 * Group flat task rows into per-member snapshots with counts.
 * Example: member has 5 tasks → working: 2, completed: 3.
 */
function buildMembers(rows) {
  const map = new Map();

  for (const row of rows) {
    const id = row.assigneeId ? String(row.assigneeId) : 'none';
    if (!map.has(id)) {
      map.set(id, {
        userId: row.assigneeId || null,
        userName: row.assigneeName || 'Unassigned',
        total: 0,
        working: 0,
        completed: 0,
        ignored: 0,
        tasks: [],
      });
    }
    const member = map.get(id);
    member.total += 1;
    if (row.lifecycle === 'Completed') member.completed += 1;
    else if (row.lifecycle === 'Ignored') member.ignored += 1;
    else member.working += 1;
    member.tasks.push(row);
  }

  return [...map.values()].sort((a, b) =>
    a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' })
  );
}

/**
 * All open tasks (still working) + tasks completed/ignored on that IST day.
 * Grouped per assignee when saved.
 */
async function loadTasksForSnapshot(organizationId, dateKey) {
  const dayStart = moment.tz(dateKey, 'YYYY-MM-DD', JOB_TIMEZONE).startOf('day');
  const dayEnd = dayStart.clone().endOf('day');

  const tasks = await Task.find({
    organizationId,
    $or: [
      { completedAt: null, ignoredAt: null },
      { completedAt: { $gte: dayStart.toDate(), $lte: dayEnd.toDate() } },
      { ignoredAt: { $gte: dayStart.toDate(), $lte: dayEnd.toDate() } },
    ],
  })
    .populate('clientId', 'organizationName')
    .populate('serviceId', 'name')
    .populate('assigneeId', 'name')
    .populate('helpingMemberId', 'name')
    .populate('managerId', 'name')
    .populate('stageId', 'name')
    .sort({ assigneeId: 1, dueDate: 1 })
    .lean();

  return tasks.map(toRow);
}

/**
 * Upsert daily snapshot for one org / dateKey into MongoDB (no email).
 */
async function captureOrganizationSnapshot({
  organizationId,
  dateKey,
  source = 'midnight',
}) {
  const rows = await loadTasksForSnapshot(organizationId, dateKey);
  const summary = buildSummary(rows);
  const members = buildMembers(rows);
  const capturedAt = new Date();

  const doc = await TaskDailySnapshot.findOneAndUpdate(
    { organizationId, dateKey },
    {
      $set: {
        timezone: JOB_TIMEZONE,
        capturedAt,
        source,
        taskCount: rows.length,
        memberCount: members.length,
        summary,
        members,
        tasks: rows,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
}

async function captureAllOrganizations({ dateKey, source = 'midnight' } = {}) {
  const key = dateKey || previousIstDateKey();
  const orgs = await Organization.find({ isActive: { $ne: false } })
    .select('_id name')
    .lean();

  const results = [];
  for (const org of orgs) {
    try {
      const snap = await captureOrganizationSnapshot({
        organizationId: org._id,
        dateKey: key,
        source,
      });
      results.push({
        organizationId: org._id,
        orgName: org.name,
        dateKey: key,
        taskCount: snap.taskCount,
        status: 'ok',
      });
      console.log(
        `[DailySnapshot] ${org.name || org._id} ${key}: ${snap.taskCount} tasks (${source})`
      );
    } catch (err) {
      console.error(
        `[DailySnapshot] Org ${org._id} failed:`,
        err.message
      );
      results.push({
        organizationId: org._id,
        orgName: org.name,
        dateKey: key,
        status: 'failed',
        error: err.message,
      });
    }
  }

  return { dateKey: key, results };
}

function rowValueFromSnapshot(row, key, timezone) {
  const tz = normalizeTimezone(timezone || JOB_TIMEZONE);
  const fmtDate = (v) => (v ? moment(v).tz(tz).format('DD/MM/YYYY') : '');
  const fmtDt = (v) => (v ? moment(v).tz(tz).format('DD/MM/YYYY HH:mm') : '');

  switch (key) {
    case 'taskCode':
      return row.taskCode || '';
    case 'title':
      return row.title || '';
    case 'client':
      return row.clientName || '';
    case 'service':
      return row.serviceName || '';
    case 'assignee':
      return row.assigneeName || '';
    case 'helpingMember':
      return row.helpingMemberName || '';
    case 'manager':
      return row.managerName || 'No manager';
    case 'status':
      return row.stageName || '';
    case 'priority':
      return row.priority || '';
    case 'dueDate':
      return fmtDate(row.dueDate);
    case 'targetDate':
      return fmtDate(row.targetDate);
    case 'lifecycle':
      return row.lifecycle || '';
    case 'completedAt':
      return fmtDt(row.completedAt);
    case 'ignoredAt':
      return fmtDt(row.ignoredAt);
    case 'budgetHours':
      return row.budgetHours ?? '';
    case 'loggedHours':
      return row.loggedHours ?? '';
    default:
      return '';
  }
}

function filterSnapshotTasks(tasks, userId) {
  if (!userId) return tasks || [];
  const id = String(userId);
  // Particular member = tasks assigned to them
  return (tasks || []).filter((t) => String(t.assigneeId || '') === id);
}

function groupSnapshotTasks(tasks) {
  const managers = new Map();

  for (const task of tasks) {
    const managerId = task.managerId ? String(task.managerId) : 'none';
    const managerName = task.managerName || 'No manager';
    const assigneeId = task.assigneeId ? String(task.assigneeId) : 'none';
    const assigneeName = task.assigneeName || 'Unassigned';

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

  return [...managers.values()]
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
}

function resolveMembers(snapshot, userId = null) {
  let members =
    Array.isArray(snapshot.members) && snapshot.members.length
      ? snapshot.members
      : buildMembers(snapshot.tasks || []);

  if (userId) {
    const id = String(userId);
    members = members.filter((m) => String(m.userId || '') === id);
  }
  return members;
}

/**
 * Manager → team members → full task list (for report UI + Excel).
 * When userId is set, only that member’s assigned tasks (still nested under their manager).
 */
function buildManagerSections(snapshot, userId = null) {
  const rows = userId
    ? (snapshot.tasks || []).filter(
        (t) => String(t.assigneeId || '') === String(userId)
      )
    : snapshot.tasks || [];
  const managers = new Map();

  for (const task of rows) {
    const managerId = task.managerId ? String(task.managerId) : 'none';
    const managerName = task.managerName || 'No manager';
    const memberId = task.assigneeId ? String(task.assigneeId) : 'none';
    const memberName = task.assigneeName || 'Unassigned';

    if (!managers.has(managerId)) {
      managers.set(managerId, {
        managerId: task.managerId || null,
        managerName,
        members: new Map(),
      });
    }
    const manager = managers.get(managerId);
    if (!manager.members.has(memberId)) {
      manager.members.set(memberId, {
        userId: task.assigneeId || null,
        userName: memberName,
        total: 0,
        working: 0,
        completed: 0,
        ignored: 0,
        tasks: [],
      });
    }
    const member = manager.members.get(memberId);
    member.total += 1;
    if (task.lifecycle === 'Completed') member.completed += 1;
    else if (task.lifecycle === 'Ignored') member.ignored += 1;
    else member.working += 1;
    member.tasks.push({
      ...task,
      lifecycleLabel: task.lifecycle === 'Open' ? 'Working' : task.lifecycle,
    });
  }

  return [...managers.values()]
    .map((m) => ({
      managerId: m.managerId,
      managerName: m.managerName,
      memberCount: m.members.size,
      taskCount: [...m.members.values()].reduce((n, mem) => n + mem.total, 0),
      members: [...m.members.values()].sort((a, b) =>
        a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' })
      ),
    }))
    .sort((a, b) => {
      if (!a.managerId) return 1;
      if (!b.managerId) return -1;
      return a.managerName.localeCompare(b.managerName);
    });
}

async function buildDailyReportWorkbook({
  orgName,
  snapshot,
  userId = null,
  columns = DEFAULT_MONTHLY_REPORT_COLUMNS,
}) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SimplyTrack';
  workbook.created = snapshot.capturedAt || new Date();

  const tz = normalizeTimezone(snapshot.timezone || JOB_TIMEZONE);
  const managerSections = buildManagerSections(snapshot, userId);
  const members = managerSections.flatMap((m) => m.members);
  const allTasks = members.flatMap((m) => m.tasks || []);
  const summary = buildSummary(allTasks);

  const memberLabel = userId
    ? members[0]?.userName || 'Member'
    : 'All members';

  // --- Primary: Manager → Team → full task list ---
  const sheet = workbook.addWorksheet('By Manager');
  const widths = [22, 22, 14, 36, 22, 16, 14, 12, 14];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  sheet.addRow([`Daily task status — ${orgName}`]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow(['Snapshot date (IST)', snapshot.dateKey]);
  sheet.addRow([
    'Saved automatically in database at',
    moment(snapshot.capturedAt).tz(tz).format('DD/MM/YYYY HH:mm z'),
  ]);
  sheet.addRow(['Scope', memberLabel]);
  sheet.addRow([]);

  sheet.addRow([
    'Manager',
    'Team member',
    'Task code',
    'Task title',
    'Client',
    'Stage',
    'Status',
    'Priority',
    'Due date',
  ]);
  sheet.getRow(sheet.lastRow.number).font = { bold: true };

  for (const manager of managerSections) {
    const mgrRow = sheet.addRow([
      manager.managerName,
      `${manager.memberCount} member(s) · ${manager.taskCount} task(s)`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    mgrRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    mgrRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4338CA' },
    };

    for (const member of manager.members) {
      const memRow = sheet.addRow([
        manager.managerName,
        member.userName,
        `${member.total} tasks`,
        `${member.working} working · ${member.completed} completed` +
          (member.ignored ? ` · ${member.ignored} ignored` : ''),
        '',
        '',
        '',
        '',
        '',
      ]);
      memRow.font = { bold: true };
      memRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' },
      };

      for (const task of member.tasks || []) {
        sheet.addRow([
          manager.managerName,
          member.userName,
          task.taskCode || '',
          task.title || '',
          task.clientName || '',
          task.stageName || '',
          task.lifecycleLabel ||
            (task.lifecycle === 'Open' ? 'Working' : task.lifecycle),
          task.priority || '',
          task.dueDate
            ? moment(task.dueDate).tz(tz).format('DD/MM/YYYY')
            : '',
        ]);
      }
    }

    sheet.addRow([]);
  }

  // --- Summary ---
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 40;
  summarySheet.addRow([`Daily Status (auto-saved in DB) — ${orgName}`]);
  summarySheet.getRow(1).font = { bold: true, size: 14 };
  summarySheet.addRow(['Snapshot date', snapshot.dateKey]);
  summarySheet.addRow([
    'Captured at',
    moment(snapshot.capturedAt).tz(tz).format('DD/MM/YYYY HH:mm z'),
  ]);
  summarySheet.addRow(['Scope', memberLabel]);
  summarySheet.addRow(['Managers', managerSections.length]);
  summarySheet.addRow(['Members', members.length]);
  summarySheet.addRow(['Total tasks', allTasks.length]);
  summarySheet.addRow([]);
  summarySheet.addRow(['Working', summary.working ?? summary.open]);
  summarySheet.addRow(['Completed', summary.completed]);
  summarySheet.addRow(['Ignored', summary.ignored]);

  // --- Flat All Tasks ---
  const allSheet = workbook.addWorksheet('All Tasks');
  const flatHeader = [
    'Manager',
    'Team member',
    ...columns.map((k) => COLUMN_LABELS[k] || k),
  ];
  allSheet.addRow(flatHeader);
  allSheet.getRow(1).font = { bold: true };
  flatHeader.forEach((_, idx) => {
    allSheet.getColumn(idx + 1).width = idx < 2 ? 22 : 18;
  });

  for (const manager of managerSections) {
    for (const member of manager.members) {
      for (const task of member.tasks || []) {
        allSheet.addRow([
          manager.managerName,
          member.userName,
          ...columns.map((key) => rowValueFromSnapshot(task, key, tz)),
        ]);
      }
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const safeOrg = String(orgName || 'Organization')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  const safeMember = String(memberLabel)
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 24);
  const fileName = `Daily-Status-${snapshot.dateKey}-${safeMember}-${safeOrg}.xlsx`;

  return {
    buffer,
    fileName,
    taskCount: allTasks.length,
    summary,
    members,
    managers: managerSections,
  };
}

module.exports = {
  JOB_TIMEZONE,
  istDateKey,
  previousIstDateKey,
  captureOrganizationSnapshot,
  captureAllOrganizations,
  buildDailyReportWorkbook,
  filterSnapshotTasks,
  buildMembers,
  resolveMembers,
  buildManagerSections,
};
