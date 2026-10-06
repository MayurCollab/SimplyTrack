const moment = require('moment-timezone');
const Settings = require('../models/Settings');
const Organization = require('../models/Organization');
const MonthlyReportRun = require('../models/MonthlyReportRun');
const MonthlyReportJobLog = require('../models/MonthlyReportJobLog');
const { runMonthlyStatusReport, retryFailedRun } = require('./monthlyReportRunner');

const JOB_TIMEZONE = 'Asia/Kolkata';
const JOB_CRON = '0 6 1 * *';
const JOB_SCHEDULE_LABEL = '0 6 1 * * Asia/Kolkata';

function previousPeriodKey(now = moment.tz(JOB_TIMEZONE)) {
  return now.clone().subtract(1, 'month').format('YYYY-MM');
}

function runDateKey(now = moment.tz(JOB_TIMEZONE)) {
  return now.format('YYYY-MM-DD');
}

async function processOrganization(settings, periodKey) {
  const orgId = settings.organizationId;
  const org = await Organization.findById(orgId).select('name').lean();
  const orgName = org?.name || '';

  const existing = await MonthlyReportRun.findOne({
    organizationId: orgId,
    periodKey,
    isTest: false,
  })
    .select('status fileName fileData')
    .lean();

  if (existing) {
    if (existing.status === 'success') {
      return {
        organizationId: orgId,
        orgName,
        status: 'skipped',
        reason: 'already_sent',
        runId: existing._id,
      };
    }
    if (existing.status === 'running') {
      return {
        organizationId: orgId,
        orgName,
        status: 'skipped',
        reason: 'already_running',
        runId: existing._id,
      };
    }

    const hasFile = Boolean(existing.fileData && existing.fileData.length);
    if ((existing.status === 'partial' || existing.status === 'failed') && hasFile) {
      try {
        const updated = await retryFailedRun(existing._id);
        return {
          organizationId: orgId,
          orgName,
          status: updated?.status || 'failed',
          reason: 'email_retry',
          runId: existing._id,
          errorMessage: updated?.errorMessage || '',
        };
      } catch (err) {
        return {
          organizationId: orgId,
          orgName,
          status: 'failed',
          reason: 'email_retry_error',
          runId: existing._id,
          errorMessage: err.message || 'Retry failed',
        };
      }
    }

    if (existing.status === 'failed' && !hasFile) {
      await MonthlyReportRun.deleteOne({ _id: existing._id });
    } else {
      return {
        organizationId: orgId,
        orgName,
        status: 'skipped',
        reason: `existing_${existing.status}`,
        runId: existing._id,
      };
    }
  }

  try {
    const result = await runMonthlyStatusReport({
      organizationId: orgId,
      periodKey,
      isTest: false,
    });

    if (result?.skipped) {
      return {
        organizationId: orgId,
        orgName,
        status: 'skipped',
        reason: result.reason || 'skipped',
        runId: result.runId || null,
      };
    }

    return {
      organizationId: orgId,
      orgName,
      status: result.status,
      reason: '',
      runId: result.runId,
      errorMessage: result.status === 'failed' ? 'Delivery failed' : '',
    };
  } catch (err) {
    console.error(`[MonthlyReport] Org ${orgId} failed:`, err.message);
    return {
      organizationId: orgId,
      orgName,
      status: 'failed',
      reason: 'exception',
      runId: null,
      errorMessage: err.message || 'Report failed',
    };
  }
}

function deriveJobStatus(orgResults) {
  const actionable = orgResults.filter((r) => r.status !== 'skipped');
  if (!actionable.length) {
    return orgResults.length ? 'success' : 'success';
  }
  const failed = actionable.filter((r) => r.status === 'failed').length;
  const partial = actionable.filter((r) => r.status === 'partial').length;
  const success = actionable.filter((r) => r.status === 'success').length;
  if (failed && (success || partial)) return 'partial';
  if (partial && !failed) return 'partial';
  if (failed && !success && !partial) return 'failed';
  return 'success';
}

/**
 * Scheduled entry: 1st of month 06:00 IST → previous month's report for all enabled orgs.
 */
async function runMonthlyReportJob({ forcePeriodKey = null } = {}) {
  const now = moment.tz(JOB_TIMEZONE);
  const periodKey = forcePeriodKey || previousPeriodKey(now);
  const dateKey = runDateKey(now);
  const jobKey = `monthly-${periodKey}`;

  let jobLog;
  try {
    jobLog = await MonthlyReportJobLog.create({
      jobKey,
      periodKey,
      runDateKey: dateKey,
      timezone: JOB_TIMEZONE,
      schedule: JOB_SCHEDULE_LABEL,
      status: 'running',
      startedAt: new Date(),
      message: `Monthly status report job started for period ${periodKey}`,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;

    jobLog = await MonthlyReportJobLog.findOne({ jobKey });
    if (!jobLog) throw err;

    if (jobLog.status === 'success') {
      console.log(`[MonthlyReport] Job ${jobKey} already completed — skipping`);
      return { skipped: true, reason: 'job_already_completed', periodKey };
    }

    // Resume failed/partial/running jobs (e.g. after process crash)
    jobLog.status = 'running';
    jobLog.runDateKey = dateKey;
    jobLog.startedAt = jobLog.startedAt || new Date();
    jobLog.message = `Monthly status report job resumed for period ${periodKey}`;
    jobLog.errorMessage = '';
    await jobLog.save();
    console.log(`[MonthlyReport] Job ${jobKey} resumed (previous status was incomplete)`);
  }

  console.log(
    `[MonthlyReport] Job ${jobKey} started (runDate=${dateKey}, schedule=${JOB_SCHEDULE_LABEL})`
  );

  try {
    const settingsList = await Settings.find({
      'monthlyStatusReport.enabled': true,
    }).lean();

    const orgResults = [];
    for (const settings of settingsList) {
      const result = await processOrganization(settings, periodKey);
      orgResults.push(result);
      console.log(
        `[MonthlyReport] Org ${result.organizationId} ${periodKey}: ${result.status}` +
          (result.reason ? ` (${result.reason})` : '')
      );
    }

    const totals = {
      orgsEnabled: settingsList.length,
      success: orgResults.filter((r) => r.status === 'success').length,
      partial: orgResults.filter((r) => r.status === 'partial').length,
      failed: orgResults.filter((r) => r.status === 'failed').length,
      skipped: orgResults.filter((r) => r.status === 'skipped').length,
    };

    const status = deriveJobStatus(orgResults);
    jobLog.orgResults = orgResults;
    jobLog.totals = totals;
    jobLog.status = status;
    jobLog.finishedAt = new Date();
    jobLog.message = `Completed ${periodKey}: ${totals.success} success, ${totals.partial} partial, ${totals.failed} failed, ${totals.skipped} skipped (of ${totals.orgsEnabled} enabled)`;
    await jobLog.save();

    console.log(`[MonthlyReport] Job ${jobKey} finished: ${jobLog.message}`);
    return { skipped: false, periodKey, jobLogId: jobLog._id, status, totals };
  } catch (err) {
    jobLog.status = 'failed';
    jobLog.finishedAt = new Date();
    jobLog.errorMessage = err.message || 'Job failed';
    jobLog.message = `Job failed for ${periodKey}`;
    await jobLog.save();
    console.error(`[MonthlyReport] Job ${jobKey} failed:`, err.message);
    throw err;
  }
}

function startMonthlyReportJob() {
  const cron = require('node-cron');

  // 1st of every month at 06:00 IST — sends previous month's report
  cron.schedule(
    JOB_CRON,
    async () => {
      try {
        await runMonthlyReportJob();
      } catch (err) {
        console.error('[MonthlyReport] Scheduled job failed:', err.message);
      }
    },
    { timezone: JOB_TIMEZONE }
  );

  console.log(
    `[MonthlyReport] Scheduler started (${JOB_SCHEDULE_LABEL}) — previous month on the 1st at 06:00 IST`
  );
}

module.exports = {
  startMonthlyReportJob,
  runMonthlyReportJob,
  previousPeriodKey,
  JOB_TIMEZONE,
  JOB_CRON,
};
