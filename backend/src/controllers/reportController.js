const MonthlyReportRun = require('../models/MonthlyReportRun');
const MonthlyReportJobLog = require('../models/MonthlyReportJobLog');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { orgFilter } = require('../utils/orgScope');
const {
  currentPeriodKey,
  normalizeTimezone,
} = require('../services/monthlyStatusReport');
const { runMonthlyStatusReport } = require('../services/monthlyReportRunner');
const { previousPeriodKey } = require('../services/monthlyReportJob');

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

module.exports = {
  listRuns,
  getRun,
  downloadRun,
  listJobLogs,
  sendTest,
};
