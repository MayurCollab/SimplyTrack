const moment = require('moment-timezone');
const TimeLog = require('../models/TimeLog');
const StageMaster = require('../models/StageMaster');
const Settings = require('../models/Settings');
const { orgFilter, getOrgId } = require('../utils/orgScope');
const {
  getOpenSession,
  getPendingNoteSession,
  recomputeTaskLoggedMinutes,
  completeClosingNote,
  sumBreakMinutesToday,
} = require('../services/timer');
const { computeDurationMinutes } = require('../services/timeCalc');
const { createTtlCache } = require('../utils/ttlCache');

const settingsCache = createTtlCache({ ttlMs: 60_000, maxSize: 200 });

async function resolveClosingNoteStage(req, closingNoteStageId) {
  const stage = await StageMaster.findOne({
    _id: closingNoteStageId,
    organizationId: orgFilter(req.user).organizationId,
    stageType: 'closing_note',
    isActive: true,
  }).lean();
  return stage;
}

async function getOrgSettings(orgId) {
  const key = String(orgId);
  const cached = settingsCache.get(key);
  if (cached) return cached;
  const settings = await Settings.findOne({ organizationId: orgId })
    .select('dailyBreakHours')
    .lean();
  const value = { dailyBreakHours: settings?.dailyBreakHours ?? 1 };
  settingsCache.set(key, value);
  return value;
}

async function listMine(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const userId = req.user._id;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: 'from and to query params are required (YYYY-MM-DD)' });
    }

    const settings = orgId
      ? await Settings.findOne({ organizationId: orgId }).select('defaultTimezone').lean()
      : null;
    const timezone = settings?.defaultTimezone || 'Asia/Kolkata';

    const rangeStart = moment.tz(from, 'YYYY-MM-DD', timezone).startOf('day').toDate();
    const rangeEnd = moment.tz(to, 'YYYY-MM-DD', timezone).endOf('day').toDate();
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const logs = await TimeLog.find({
      userId,
      organizationId: orgId,
      startedAt: { $gte: rangeStart, $lte: rangeEnd },
      stoppedAt: { $ne: null },
      pendingClosingNote: { $ne: true },
    })
      .populate('taskId', 'taskCode title')
      .populate('timeAdjustmentRequestId', 'ticketNumber status')
      .sort({ startedAt: -1 })
      .lean();

    res.json({ data: logs, timezone });
  } catch (err) {
    next(err);
  }
}

async function getActive(req, res, next) {
  try {
    const userId = req.user._id;
    const orgId = getOrgId(req.user);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [active, pendingNote, settings, breakMinutesClosed] = await Promise.all([
      getOpenSession(userId),
      getPendingNoteSession(userId),
      orgId ? getOrgSettings(orgId) : Promise.resolve({ dailyBreakHours: 1 }),
      orgId ? sumBreakMinutesToday(userId, startOfDay) : Promise.resolve(0),
    ]);

    let breakMinutesToday = breakMinutesClosed || 0;
    if (active?.type === 'break') {
      breakMinutesToday += computeDurationMinutes(active.startedAt);
    }

    const dailyBreakHours = settings?.dailyBreakHours ?? 1;
    const dailyBreakMinutes = dailyBreakHours * 60;

    res.json({
      data: {
        active,
        pendingNote,
        breakMinutesToday,
        dailyBreakMinutes,
        breakOverAllowance: breakMinutesToday > dailyBreakMinutes,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function submitPendingNote(req, res, next) {
  try {
    const { closingNote, closingNoteStageId, timeLogId } = req.body;

    if (!closingNote?.trim() || closingNote.trim().length < 10) {
      return res.status(400).json({ message: 'Closing note must be at least 10 characters' });
    }

    const pending = timeLogId
      ? await TimeLog.findOne({ _id: timeLogId, userId: req.user._id, pendingClosingNote: true })
      : await getPendingNoteSession(req.user._id);

    if (!pending) {
      return res.status(404).json({ message: 'No pending closing note' });
    }

    let closingStageId = null;
    // Closing note stage is required for task sessions only (not break / training)
    if (pending.type === 'task') {
      const closingStage = await resolveClosingNoteStage(req, closingNoteStageId);
      if (!closingStage) {
        return res.status(400).json({ message: 'Invalid closing note stage' });
      }
      closingStageId = closingStage._id;
    }

    const log = await completeClosingNote(
      pending._id,
      req.user._id,
      closingNote.trim(),
      closingStageId
    );
    res.json({ data: log, message: 'Closing note saved' });
  } catch (err) {
    next(err);
  }
}

async function startBreak(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const userId = req.user._id;

    const [pending, open] = await Promise.all([
      getPendingNoteSession(userId),
      getOpenSession(userId),
    ]);
    if (pending) {
      return res.status(409).json({
        message: 'Please add a closing note for your previous session first',
        data: { pendingNote: pending },
      });
    }

    if (open) {
      if (open.type === 'break') {
        return res.status(400).json({ message: 'Break already running' });
      }
      return res.status(409).json({
        message: 'Add a closing note for your current session before starting break',
        data: { activeSession: open },
      });
    }

    const log = await TimeLog.create({
      organizationId: orgId,
      userId,
      type: 'break',
      startedAt: new Date(),
    });

    res.status(201).json({ data: log.toObject(), message: 'Break started' });
  } catch (err) {
    next(err);
  }
}

async function stopBreak(req, res, next) {
  try {
    const { closingNote } = req.body;

    if (!closingNote?.trim() || closingNote.trim().length < 10) {
      return res.status(400).json({ message: 'Closing note must be at least 10 characters' });
    }

    const open = await TimeLog.findOne({
      userId: req.user._id,
      type: 'break',
      stoppedAt: null,
    });

    if (!open) {
      const pending = await TimeLog.findOne({
        userId: req.user._id,
        type: 'break',
        pendingClosingNote: true,
      });
      if (pending) {
        const log = await completeClosingNote(
          pending._id,
          req.user._id,
          closingNote.trim(),
          null
        );
        return res.json({ data: log, message: 'Break stopped' });
      }
      return res.status(404).json({ message: 'No break in progress' });
    }

    const stoppedAt = new Date();
    open.stoppedAt = stoppedAt;
    open.systemDurationMinutes = computeDurationMinutes(open.startedAt, stoppedAt);
    open.closingNote = closingNote.trim();
    open.closingNoteStageId = null;
    open.pendingClosingNote = false;
    await open.save();

    res.json({ data: open, message: 'Break stopped' });
  } catch (err) {
    next(err);
  }
}

async function startTraining(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const userId = req.user._id;

    const [pending, open] = await Promise.all([
      getPendingNoteSession(userId),
      getOpenSession(userId),
    ]);
    if (pending) {
      return res.status(409).json({
        message: 'Please add a closing note for your previous session first',
        data: { pendingNote: pending },
      });
    }

    if (open) {
      if (open.type === 'training') {
        return res.status(400).json({ message: 'Training already running' });
      }
      return res.status(409).json({
        message: 'Add a closing note for your current session before starting training',
        data: { activeSession: open },
      });
    }

    const log = await TimeLog.create({
      organizationId: orgId,
      userId,
      type: 'training',
      startedAt: new Date(),
    });

    res.status(201).json({ data: log.toObject(), message: 'Training started' });
  } catch (err) {
    next(err);
  }
}

async function stopTraining(req, res, next) {
  try {
    const { closingNote } = req.body;

    if (!closingNote?.trim() || closingNote.trim().length < 10) {
      return res.status(400).json({ message: 'Closing note must be at least 10 characters' });
    }

    const open = await TimeLog.findOne({
      userId: req.user._id,
      type: 'training',
      stoppedAt: null,
    });

    if (!open) {
      const pending = await TimeLog.findOne({
        userId: req.user._id,
        type: 'training',
        pendingClosingNote: true,
      });
      if (pending) {
        const log = await completeClosingNote(
          pending._id,
          req.user._id,
          closingNote.trim(),
          null
        );
        return res.json({ data: log, message: 'Training stopped' });
      }
      return res.status(404).json({ message: 'No training in progress' });
    }

    const stoppedAt = new Date();
    open.stoppedAt = stoppedAt;
    open.systemDurationMinutes = computeDurationMinutes(open.startedAt, stoppedAt);
    open.closingNote = closingNote.trim();
    open.closingNoteStageId = null;
    open.pendingClosingNote = false;
    await open.save();

    res.json({ data: open, message: 'Training stopped' });
  } catch (err) {
    next(err);
  }
}

async function correctDuration(req, res, next) {
  try {
    const user = req.user;
    const { hasPermission } = require('../services/permissionCache');
    const canCorrect =
      user.role === 'super_admin' ||
      user.role === 'owner' ||
      (await hasPermission(user, 'timelogs', 'edit')) ||
      (await hasPermission(user, 'tasks', 'editLoggedTime'));

    if (!canCorrect) {
      return res.status(403).json({ message: 'You do not have permission to correct logged time' });
    }

    const { correctedDurationMinutes } = req.body;
    if (correctedDurationMinutes == null || correctedDurationMinutes < 0) {
      return res.status(400).json({ message: 'correctedDurationMinutes is required' });
    }

    const log = await TimeLog.findOne({
      _id: req.params.id,
      ...orgFilter(req.user),
      stoppedAt: { $ne: null },
    });

    if (!log) return res.status(404).json({ message: 'Time log not found' });

    log.correctedDurationMinutes = correctedDurationMinutes;
    log.correctedBy = req.user._id;
    log.correctedAt = new Date();
    await log.save();

    if (log.type === 'task' && log.taskId) {
      await recomputeTaskLoggedMinutes(log.taskId);
    }

    res.json({ data: log, message: 'Duration corrected' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMine,
  getActive,
  submitPendingNote,
  startBreak,
  stopBreak,
  startTraining,
  stopTraining,
  correctDuration,
};
