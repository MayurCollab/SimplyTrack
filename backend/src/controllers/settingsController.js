const Settings = require('../models/Settings');
const User = require('../models/User');
const { orgFilter } = require('../utils/orgScope');
const { MONTHLY_REPORT_COLUMNS } = require('../constants/monthlyReportColumns');
const { resolveSelectedColumns, normalizeTimezone } = require('../services/monthlyStatusReport');
const { isValidEmail } = require('../utils/email');

function serializeSettings(doc) {
  const cfg = doc.monthlyStatusReport || {};
  return {
    _id: doc._id,
    organizationId: doc.organizationId,
    primaryColor: doc.primaryColor,
    dateFormat: doc.dateFormat,
    weekStartsOn: doc.weekStartsOn,
    defaultTimezone: normalizeTimezone(doc.defaultTimezone || 'Asia/Kolkata'),
    dailyWorkingHours: doc.dailyWorkingHours,
    dailyBreakHours: doc.dailyBreakHours,
    monthlyStatusReport: {
      enabled: Boolean(cfg.enabled),
      sendTime: cfg.sendTime || '23:55',
      recipientUserIds: (cfg.recipientUserIds || []).map((id) => String(id)),
      externalEmails: cfg.externalEmails || [],
      selectedColumns: resolveSelectedColumns(cfg.selectedColumns),
      lastSuccessPeriodKey: cfg.lastSuccessPeriodKey || '',
    },
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

async function ensureSettings(organizationId) {
  let settings = await Settings.findOne({ organizationId });
  if (!settings) {
    settings = await Settings.create({
      organizationId,
      defaultTimezone: 'Asia/Kolkata',
    });
  }
  return settings;
}

async function getSettings(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const settings = await ensureSettings(organizationId);
    const recipientOptions = await User.find({
      organizationId,
      isActive: true,
      role: { $in: ['owner', 'manager', 'staff'] },
    })
      .select('name email role')
      .sort({ name: 1 })
      .lean();

    res.json({
      data: serializeSettings(settings),
      meta: {
        monthlyReportColumns: MONTHLY_REPORT_COLUMNS,
        recipientOptions,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const { organizationId } = orgFilter(req.user);
    const settings = await ensureSettings(organizationId);
    const body = req.body || {};

    if (body.primaryColor !== undefined) settings.primaryColor = body.primaryColor;
    if (body.dateFormat !== undefined) settings.dateFormat = body.dateFormat;
    if (body.weekStartsOn !== undefined) settings.weekStartsOn = body.weekStartsOn;
    if (body.defaultTimezone !== undefined) {
      settings.defaultTimezone = normalizeTimezone(body.defaultTimezone);
    }
    if (body.dailyWorkingHours !== undefined) {
      settings.dailyWorkingHours = body.dailyWorkingHours;
    }
    if (body.dailyBreakHours !== undefined) {
      settings.dailyBreakHours = body.dailyBreakHours;
    }

    if (body.monthlyStatusReport) {
      const msr = body.monthlyStatusReport;
      if (!settings.monthlyStatusReport) {
        settings.monthlyStatusReport = {};
      }

      if (msr.enabled !== undefined) {
        settings.monthlyStatusReport.enabled = Boolean(msr.enabled);
      }
      if (msr.sendTime !== undefined) {
        settings.monthlyStatusReport.sendTime = msr.sendTime;
      }
      if (msr.selectedColumns !== undefined) {
        settings.monthlyStatusReport.selectedColumns = resolveSelectedColumns(
          msr.selectedColumns
        );
      }
      if (msr.externalEmails !== undefined) {
        const emails = [...new Set(
          (msr.externalEmails || [])
            .map((e) => String(e).trim().toLowerCase())
            .filter(Boolean)
        )];
        for (const email of emails) {
          if (!isValidEmail(email)) {
            return res.status(400).json({ message: `Invalid external email: ${email}` });
          }
        }
        settings.monthlyStatusReport.externalEmails = emails;
      }
      if (msr.recipientUserIds !== undefined) {
        const ids = [...new Set((msr.recipientUserIds || []).map(String))];
        if (ids.length) {
          const users = await User.find({
            _id: { $in: ids },
            organizationId,
          })
            .select('_id')
            .lean();
          if (users.length !== ids.length) {
            return res.status(400).json({ message: 'One or more recipient users are invalid' });
          }
        }
        settings.monthlyStatusReport.recipientUserIds = ids;
      }

      const enabled = settings.monthlyStatusReport.enabled;
      const hasUsers = (settings.monthlyStatusReport.recipientUserIds || []).length > 0;
      const hasExternal = (settings.monthlyStatusReport.externalEmails || []).length > 0;
      if (enabled && !hasUsers && !hasExternal) {
        return res.status(400).json({
          message: 'Add at least one recipient before enabling the monthly status report',
        });
      }
    }

    await settings.save();
    res.json({ data: serializeSettings(settings), message: 'Settings saved' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
