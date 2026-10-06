const Settings = require('../models/Settings');
const User = require('../models/User');
const Organization = require('../models/Organization');
const MonthlyReportRun = require('../models/MonthlyReportRun');
const { buildMonthlySnapshot, normalizeTimezone, currentPeriodKey } = require('./monthlyStatusReport');
const { buildMonthlyReportWorkbook, periodLabel } = require('./monthlyReportExcel');
const { sendMonthlyStatusReportEmail } = require('./mailer');
const { DEFAULT_MONTHLY_REPORT_COLUMNS } = require('../constants/monthlyReportColumns');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSummaryHtml(summary) {
  const life = summary?.byLifecycle || {};
  const managers = summary?.byManager || [];
  const statusRows = Object.entries(summary?.byStatus || {})
    .map(
      ([name, count]) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(name)}</td><td style="padding:4px 8px;border-bottom:1px solid #E5E7EB;text-align:right;">${count}</td></tr>`
    )
    .join('');

  const managerRows = managers
    .map(
      (m) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(m.managerName)}</td><td style="padding:4px 8px;border-bottom:1px solid #E5E7EB;text-align:right;">${m.taskCount}</td><td style="padding:4px 8px;border-bottom:1px solid #E5E7EB;text-align:right;">${m.open}</td></tr>`
    )
    .join('');

  return `
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#111827;">Totals</p>
    <p style="margin:0 0 12px;font-size:13px;color:#374151;">
      Open: <strong>${life.Open || 0}</strong> ·
      Completed (month): <strong>${life.Completed || 0}</strong> ·
      Ignored (month): <strong>${life.Ignored || 0}</strong> ·
      Total: <strong>${summary?.totalTasks || 0}</strong>
    </p>
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#111827;">By status</p>
    <table width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#374151;margin-bottom:12px;">
      ${statusRows || '<tr><td style="padding:4px 8px;">No tasks</td></tr>'}
    </table>
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#111827;">By manager</p>
    <table width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#374151;">
      <tr>
        <td style="padding:4px 8px;font-weight:600;">Manager</td>
        <td style="padding:4px 8px;font-weight:600;text-align:right;">Tasks</td>
        <td style="padding:4px 8px;font-weight:600;text-align:right;">Open</td>
      </tr>
      ${managerRows || '<tr><td style="padding:4px 8px;" colspan="3">No tasks</td></tr>'}
    </table>
  `;
}

async function resolveRecipients(settingsDoc, organizationId) {
  const cfg = settingsDoc.monthlyStatusReport || {};
  const userIds = cfg.recipientUserIds || [];
  const externalEmails = (cfg.externalEmails || [])
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);

  const users = userIds.length
    ? await User.find({
        _id: { $in: userIds },
        organizationId,
        isActive: true,
      })
        .select('name email')
        .lean()
    : [];

  const list = [];
  const seen = new Set();

  for (const user of users) {
    const email = String(user.email || '')
      .trim()
      .toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    list.push({
      email,
      userId: user._id,
      type: 'user',
      name: user.name || '',
    });
  }

  for (const email of externalEmails) {
    if (seen.has(email)) continue;
    seen.add(email);
    list.push({
      email,
      userId: null,
      type: 'external',
      name: '',
    });
  }

  return list;
}

async function deliverToRecipients({
  recipients,
  orgName,
  periodLabelText,
  generatedAtLabel,
  timezone,
  summaryHtml,
  fileName,
  fileBuffer,
  isTest,
}) {
  const delivery = [];

  for (const recipient of recipients) {
    const entry = {
      email: recipient.email,
      userId: recipient.userId,
      type: recipient.type,
      status: 'pending',
      error: '',
      attempts: 0,
    };

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      entry.attempts = attempt;
      try {
        await sendMonthlyStatusReportEmail({
          to: recipient.email,
          recipientName: recipient.name,
          orgName,
          periodLabel: periodLabelText,
          generatedAtLabel,
          timezone,
          summaryHtml,
          fileName,
          fileBuffer,
          isTest,
        });
        entry.status = 'sent';
        entry.error = '';
        break;
      } catch (err) {
        entry.status = 'failed';
        entry.error = err.message || 'Send failed';
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    delivery.push(entry);
  }

  return delivery;
}

function deriveRunStatus(delivery) {
  if (!delivery.length) return 'failed';
  const sent = delivery.filter((d) => d.status === 'sent').length;
  const failed = delivery.filter((d) => d.status === 'failed').length;
  if (sent === delivery.length) return 'success';
  if (sent > 0 && failed > 0) return 'partial';
  return 'failed';
}

/**
 * Generate Excel + email for one org/period.
 * For scheduled runs: claims MonthlyReportRun with unique periodKey.
 */
async function runMonthlyStatusReport({
  organizationId,
  periodKey,
  isTest = false,
  forceRecipients = null,
}) {
  const org = await Organization.findById(organizationId).lean();
  if (!org) {
    throw Object.assign(new Error('Organization not found'), { status: 404 });
  }

  let settings = await Settings.findOne({ organizationId });
  if (!settings) {
    settings = await Settings.create({
      organizationId,
      defaultTimezone: 'Asia/Kolkata',
      monthlyStatusReport: {
        selectedColumns: [...DEFAULT_MONTHLY_REPORT_COLUMNS],
      },
    });
  }

  const timezone = normalizeTimezone(settings.defaultTimezone || 'Asia/Kolkata');
  const cfg = settings.monthlyStatusReport || {};
  const selectedColumns =
    cfg.selectedColumns?.length > 0
      ? cfg.selectedColumns
      : [...DEFAULT_MONTHLY_REPORT_COLUMNS];

  const recipients = forceRecipients || (await resolveRecipients(settings, organizationId));

  if (!isTest && !cfg.enabled) {
    return { skipped: true, reason: 'disabled' };
  }

  if (!recipients.length) {
    console.warn(
      `[MonthlyReport] Org ${organizationId} period ${periodKey}: enabled but no recipients`
    );
    if (!isTest) {
      try {
        await MonthlyReportRun.create({
          organizationId,
          periodKey,
          isTest: false,
          status: 'failed',
          timezone,
          startedAt: new Date(),
          finishedAt: new Date(),
          errorMessage: 'no_recipients',
          selectedColumns,
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    return { skipped: true, reason: 'no_recipients' };
  }

  let run = null;
  if (!isTest) {
    try {
      run = await MonthlyReportRun.create({
        organizationId,
        periodKey,
        isTest: false,
        status: 'running',
        timezone,
        startedAt: new Date(),
        selectedColumns,
        recipientSnapshot: recipients.map((r) => ({
          email: r.email,
          userId: r.userId,
          type: r.type,
          status: 'pending',
        })),
      });
    } catch (err) {
      if (err.code === 11000) {
        return { skipped: true, reason: 'already_claimed' };
      }
      throw err;
    }
  } else {
    run = await MonthlyReportRun.create({
      organizationId,
      periodKey,
      isTest: true,
      status: 'running',
      timezone,
      startedAt: new Date(),
      selectedColumns,
      recipientSnapshot: recipients.map((r) => ({
        email: r.email,
        userId: r.userId,
        type: r.type,
        status: 'pending',
      })),
    });
  }

  try {
    const reportPeriodKey = /^\d{4}-\d{2}$/.test(periodKey)
      ? periodKey
      : currentPeriodKey(timezone);

    const snapshot = await buildMonthlySnapshot({
      organizationId,
      periodKey: reportPeriodKey,
      timezone,
      selectedColumns,
    });

    const { buffer, fileName } = await buildMonthlyReportWorkbook({
      orgName: org.name,
      snapshot,
      isTest,
    });

    // Persist Excel snapshot before email so download works even if SMTP fails
    run.generatedAt = snapshot.generatedAt;
    run.summary = snapshot.summary;
    run.fileName = fileName;
    run.fileData = buffer;
    run.status = 'running';
    await run.save();

    const momentTz = require('moment-timezone');
    const periodLabelText = periodLabel(snapshot.periodKey);
    const generatedAtLabel = momentTz(snapshot.generatedAt)
      .tz(timezone)
      .format('DD/MM/YYYY HH:mm');
    const summaryHtml = buildSummaryHtml(snapshot.summary);

    const delivery = await deliverToRecipients({
      recipients,
      orgName: org.name,
      periodLabelText,
      generatedAtLabel,
      timezone,
      summaryHtml,
      fileName,
      fileBuffer: buffer,
      isTest,
    });

    const status = deriveRunStatus(delivery);

    run.status = status;
    run.finishedAt = new Date();
    run.delivery = delivery;
    run.errorMessage =
      status === 'failed'
        ? delivery.map((d) => d.error).filter(Boolean).join('; ') || 'All sends failed'
        : status === 'partial'
          ? 'Some recipients failed'
          : '';
    await run.save();

    if (!isTest && status === 'success') {
      settings.monthlyStatusReport.lastSuccessPeriodKey = reportPeriodKey;
      await settings.save();
    }

    return {
      skipped: false,
      runId: run._id,
      status,
      periodKey: snapshot.periodKey,
      delivery,
      fileName,
    };
  } catch (err) {
    run.status = 'failed';
    run.finishedAt = new Date();
    run.errorMessage = err.message || 'Report generation failed';
    await run.save();
    throw err;
  }
}

/**
 * Retry failed/partial scheduled deliveries for a run still in the send window.
 */
async function retryFailedRun(runId) {
  const run = await MonthlyReportRun.findById(runId);
  if (!run || run.isTest) return null;
  if (run.status === 'success') return run;
  if (!run.fileData) return run;

  const org = await Organization.findById(run.organizationId).lean();
  if (!org) return run;

  const failed = (run.delivery || []).filter((d) => d.status !== 'sent');
  if (!failed.length) {
    run.status = 'success';
    await run.save();
    return run;
  }

  const periodLabelText = periodLabel(run.periodKey);
  const generatedAtLabel = require('moment-timezone')(run.generatedAt || new Date())
    .tz(run.timezone || 'Asia/Kolkata')
    .format('DD/MM/YYYY HH:mm');
  const summaryHtml = buildSummaryHtml(run.summary || {});

  for (const entry of run.delivery) {
    if (entry.status === 'sent') continue;
    entry.attempts = (entry.attempts || 0) + 1;
    try {
      await sendMonthlyStatusReportEmail({
        to: entry.email,
        recipientName: '',
        orgName: org.name,
        periodLabel: periodLabelText,
        generatedAtLabel,
        timezone: run.timezone,
        summaryHtml,
        fileName: run.fileName,
        fileBuffer: run.fileData,
        isTest: false,
      });
      entry.status = 'sent';
      entry.error = '';
    } catch (err) {
      entry.status = 'failed';
      entry.error = err.message || 'Send failed';
    }
  }

  run.status = deriveRunStatus(run.delivery);
  run.finishedAt = new Date();
  run.errorMessage =
    run.status === 'failed'
      ? 'All sends failed'
      : run.status === 'partial'
        ? 'Some recipients failed'
        : '';
  await run.save();

  if (run.status === 'success') {
    await Settings.updateOne(
      { organizationId: run.organizationId },
      { $set: { 'monthlyStatusReport.lastSuccessPeriodKey': run.periodKey } }
    );
  }

  return run;
}

module.exports = {
  resolveRecipients,
  runMonthlyStatusReport,
  retryFailedRun,
  buildSummaryHtml,
};
