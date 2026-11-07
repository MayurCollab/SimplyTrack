const mongoose = require('mongoose');
const MonthlyReportRun = require('../models/MonthlyReportRun');
const MonthlyReportJobLog = require('../models/MonthlyReportJobLog');
const TaskDailySnapshot = require('../models/TaskDailySnapshot');
const Organization = require('../models/Organization');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { orgFilter } = require('../utils/orgScope');
const {
  currentPeriodKey,
  normalizeTimezone,
} = require('../services/monthlyStatusReport');
const { runMonthlyStatusReport } = require('../services/monthlyReportRunner');
const { previousPeriodKey } = require('../services/monthlyReportJob');
const {
  istDateKey,
  previousIstDateKey,
  captureOrganizationSnapshot,
  buildDailyReportWorkbook,
  buildManagerSections,
} = require('../services/dailyStatusSnapshot');
const { DEFAULT_MONTHLY_REPORT_COLUMNS } = require('../constants/monthlyReportColumns');

function serializeRun(run, { includeFile = false } = {}) {
  const base = {
    _id: run._id,
    organizationId: run.organizationId,
    periodKey: run.periodKey,
    status: run.status,
    isTest: Boolean(run.isTest),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    generatedAt: run.generatedAt,
    timezone: run.timezone,
    summary: run.summary || {},
    selectedColumns: run.selectedColumns || [],
    fileName: run.fileName || '',
    hasFile: Boolean(run.fileData && run.fileData.length),
    delivery: (run.delivery || []).map((d) => ({
      email: d.email,
      type: d.type,
      status: d.status,
      error: d.error,
      attempts: d.attempts,
    })),
    errorMessage: run.errorMessage || '',
    createdAt: run.createdAt,
  };
  if (includeFile) {
    base.fileContentType = run.fileContentType;
  }
  return base;
}

async function listRuns(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const includeTests = req.query.includeTests === 'true';
    const filter = { organizationId };
    if (!includeTests) filter.isTest = false;

    const runs = await MonthlyReportRun.find(filter)
      .select('-fileData')
      .sort({ createdAt: -1 })
      .limit(48)
      .lean();

    res.json({
      data: runs.map((r) => serializeRun(r)),
    });
  } catch (err) {
    next(err);
  }
}

async function getRun(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const run = await MonthlyReportRun.findOne({
      _id: req.params.id,
      organizationId,
    })
      .select('-fileData')
      .lean();

    if (!run) return res.status(404).json({ message: 'Report not found' });
    res.json({ data: serializeRun(run) });
  } catch (err) {
    next(err);
  }
}

async function downloadRun(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const run = await MonthlyReportRun.findOne({
      _id: req.params.id,
      organizationId,
    });

    if (!run) return res.status(404).json({ message: 'Report not found' });
    if (!run.fileData || !run.fileData.length) {
      return res.status(404).json({ message: 'Report file is not available' });
    }

    const fileName = run.fileName || `Monthly-Status-Report-${run.periodKey}.xlsx`;
    res.setHeader(
      'Content-Type',
      run.fileContentType ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, '')}"`
    );
    res.send(Buffer.from(run.fileData));
  } catch (err) {
    next(err);
  }
}

async function listJobLogs(req, res, next) {
  try {
    // Job logs are global to the scheduler; owners/managers with reports.view can see them.
    // Filter orgResults to the caller's org for non-super clarity.
    const { organizationId } = orgFilter(req.user);
    const logs = await MonthlyReportJobLog.find({})
      .sort({ startedAt: -1 })
      .limit(24)
      .lean();

    const data = logs.map((log) => {
      const orgResults = (log.orgResults || []).filter(
        (r) => String(r.organizationId) === String(organizationId)
      );
      return {
        _id: log._id,
        jobKey: log.jobKey,
        periodKey: log.periodKey,
        runDateKey: log.runDateKey,
        timezone: log.timezone,
        schedule: log.schedule,
        status: log.status,
        startedAt: log.startedAt,
        finishedAt: log.finishedAt,
        message: log.message,
        errorMessage: log.errorMessage,
        totals: log.totals,
        orgResult: orgResults[0] || null,
      };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function sendTest(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const settings = await Settings.findOne({ organizationId });
    const timezone = normalizeTimezone(settings?.defaultTimezone || 'Asia/Kolkata');
    // Test uses previous month by default (same as scheduled job); optional current month via body
    const useCurrent = req.body?.period === 'current';
    const periodKey = useCurrent
      ? currentPeriodKey(timezone)
      : previousPeriodKey();

    // Safer default: send only to the caller
    const onlyMe = req.body?.onlyMe !== false;
    let forceRecipients = null;

    if (onlyMe) {
      const me = await User.findById(req.user._id)
        .select('name email isActive')
        .lean();
      if (!me?.email || me.isActive === false) {
        return res.status(400).json({ message: 'Your user email is not available' });
      }
      forceRecipients = [
        {
          email: String(me.email).toLowerCase(),
          userId: me._id,
          type: 'user',
          name: me.name || '',
        },
      ];
    }

    const result = await runMonthlyStatusReport({
      organizationId,
      periodKey,
      isTest: true,
      forceRecipients,
    });

    if (result.skipped) {
      return res.status(400).json({
        message:
          result.reason === 'no_recipients'
            ? 'No recipients configured'
            : `Test skipped: ${result.reason}`,
      });
    }

    const run = await MonthlyReportRun.findById(result.runId).select('-fileData').lean();
    res.json({
      data: serializeRun(run),
      message:
        result.status === 'success'
          ? `Test report sent for ${periodKey}`
          : result.status === 'partial'
            ? 'Test report partially sent'
            : 'Test report failed to send',
    });
  } catch (err) {
    next(err);
  }
}

async function listDailySnapshots(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const snapshots = await TaskDailySnapshot.find({ organizationId })
      .select(
        'dateKey capturedAt source taskCount memberCount summary.open summary.working summary.completed summary.ignored members.userId members.userName members.total members.working members.completed members.ignored'
      )
      .sort({ dateKey: -1 })
      .limit(90)
      .lean();

    res.json({
      data: snapshots.map((s) => ({
        _id: s._id,
        dateKey: s.dateKey,
        capturedAt: s.capturedAt,
        source: s.source,
        taskCount: s.taskCount,
        memberCount: s.memberCount ?? s.members?.length ?? 0,
        open: s.summary?.working ?? s.summary?.open ?? 0,
        working: s.summary?.working ?? s.summary?.open ?? 0,
        completed: s.summary?.completed ?? 0,
        ignored: s.summary?.ignored ?? 0,
        members: (s.members || []).map((m) => ({
          userId: m.userId,
          userName: m.userName,
          total: m.total,
          working: m.working,
          completed: m.completed,
          ignored: m.ignored,
        })),
      })),
      meta: {
        timezone: 'Asia/Kolkata',
        schedule: '0 0 * * * Asia/Kolkata',
        storage: 'database',
        emailed: false,
        todayKey: istDateKey(),
        yesterdayKey: previousIstDateKey(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Full per-member task list for one date (from DB — not email). */
async function getDailySnapshotDetail(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const dateKey = String(req.query.date || req.params.dateKey || '').trim();
    const userIdRaw = String(req.query.userId || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({
        message: 'Provide date as YYYY-MM-DD',
      });
    }

    const snapshot = await TaskDailySnapshot.findOne({
      organizationId,
      dateKey,
    }).lean();

    if (!snapshot) {
      return res.status(404).json({
        message: `No database snapshot for ${dateKey}. Click Capture now, or wait for midnight IST.`,
      });
    }

    const managers = buildManagerSections(snapshot, userIdRaw || null);
    const members = managers.flatMap((g) => g.members);
    const taskCount = members.reduce((n, m) => n + (m.total || 0), 0);

    res.json({
      data: {
        _id: snapshot._id,
        dateKey: snapshot.dateKey,
        capturedAt: snapshot.capturedAt,
        source: snapshot.source,
        taskCount,
        memberCount: members.length,
        managerCount: managers.length,
        summary: {
          working: members.reduce((n, m) => n + (m.working || 0), 0),
          completed: members.reduce((n, m) => n + (m.completed || 0), 0),
          ignored: members.reduce((n, m) => n + (m.ignored || 0), 0),
        },
        // Manager → team → full task list
        managers: managers.map((g) => ({
          managerId: g.managerId,
          managerName: g.managerName,
          memberCount: g.memberCount,
          taskCount: g.taskCount,
          members: g.members.map((m) => ({
            userId: m.userId,
            userName: m.userName,
            total: m.total,
            working: m.working,
            completed: m.completed,
            ignored: m.ignored,
            tasks: (m.tasks || []).map((t) => ({
              taskId: t.taskId,
              taskCode: t.taskCode,
              title: t.title,
              clientName: t.clientName,
              serviceName: t.serviceName,
              stageName: t.stageName,
              lifecycle:
                t.lifecycleLabel ||
                (t.lifecycle === 'Open' ? 'Working' : t.lifecycle),
              priority: t.priority,
              dueDate: t.dueDate,
              budgetHours: t.budgetHours,
              loggedHours: t.loggedHours,
            })),
          })),
        })),
        // Kept for older clients
        members: members.map((m) => ({
          userId: m.userId,
          userName: m.userName,
          total: m.total,
          working: m.working,
          completed: m.completed,
          ignored: m.ignored,
          tasks: m.tasks || [],
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function downloadDailySnapshot(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const dateKey = String(req.query.date || req.body?.date || '').trim();
    const userIdRaw = String(req.query.userId || req.body?.userId || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({
        message: 'Provide date as YYYY-MM-DD (IST snapshot date)',
      });
    }

    let userId = null;
    if (userIdRaw) {
      if (!mongoose.Types.ObjectId.isValid(userIdRaw)) {
        return res.status(400).json({ message: 'Invalid member id' });
      }
      userId = userIdRaw;
    }

    const snapshot = await TaskDailySnapshot.findOne({
      organizationId,
      dateKey,
    }).lean();

    if (!snapshot) {
      return res.status(404).json({
        message: `No status snapshot for ${dateKey}. Snapshots are saved daily at 12:00 AM IST. Use “Capture now” if you need today’s state.`,
      });
    }

    const org = await Organization.findById(organizationId).select('name').lean();
    const settings = await Settings.findOne({ organizationId })
      .select('monthlyStatusReport.selectedColumns')
      .lean();
    const columns =
      settings?.monthlyStatusReport?.selectedColumns?.length > 0
        ? settings.monthlyStatusReport.selectedColumns
        : DEFAULT_MONTHLY_REPORT_COLUMNS;

    const { buffer, fileName } = await buildDailyReportWorkbook({
      orgName: org?.name || 'Organization',
      snapshot,
      userId,
      columns,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, '')}"`
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/** Capture current task status for a date (default: previous IST day, same as midnight job). */
async function captureDailySnapshotNow(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const requested = String(req.body?.date || '').trim();
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : previousIstDateKey();

    const snap = await captureOrganizationSnapshot({
      organizationId,
      dateKey,
      source: 'manual',
    });

    res.json({
      data: {
        _id: snap._id,
        dateKey: snap.dateKey,
        capturedAt: snap.capturedAt,
        source: snap.source,
        taskCount: snap.taskCount,
        memberCount: snap.memberCount ?? snap.members?.length ?? 0,
        open: snap.summary?.working ?? snap.summary?.open ?? 0,
        working: snap.summary?.working ?? snap.summary?.open ?? 0,
        completed: snap.summary?.completed ?? 0,
        ignored: snap.summary?.ignored ?? 0,
        members: (snap.members || []).map((m) => ({
          userId: m.userId,
          userName: m.userName,
          total: m.total,
          working: m.working,
          completed: m.completed,
          ignored: m.ignored,
        })),
      },
      message: `Saved to database for ${dateKey}: ${snap.taskCount} tasks across ${snap.memberCount ?? snap.members?.length ?? 0} members (not emailed)`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRuns,
  getRun,
  downloadRun,
  listJobLogs,
  sendTest,
  listDailySnapshots,
  getDailySnapshotDetail,
  downloadDailySnapshot,
  captureDailySnapshotNow,
};
