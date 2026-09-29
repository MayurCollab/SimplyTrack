const TimeLog = require('../models/TimeLog');
const StageMaster = require('../models/StageMaster');
const Settings = require('../models/Settings');
const { orgFilter } = require('../utils/orgScope');
const {
  getOpenSession,
  getPendingNoteSession,
  recomputeTaskLoggedMinutes,
  completeClosingNote,
} = require('../services/timer');
const { computeDurationMinutes, effectiveDurationMinutes } = require('../services/timeCalc');

async function resolveClosingNoteStage(req, closingNoteStageId) {
  const stage = await StageMaster.findOne({
    _id: closingNoteStageId,
    organizationId: orgFilter(req.user).organizationId,
    stageType: 'closing_note',
    isActive: true,
  }).lean();
  return stage;
}

async function getActive(req, res, next) {
  try {
    const userId = req.user._id;
    const active = await getOpenSession(userId);
    const pendingNote = await getPendingNoteSession(userId);

    let breakMinutesToday = 0;
    let dailyBreakHours = 1;

    if (req.user.organizationId) {
      const settings = await Settings.findOne({ organizationId: req.user.organizationId }).lean();
      dailyBreakHours = settings?.dailyBreakHours ?? 1;

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const breakLogs = await TimeLog.find({
        userId,
        type: 'break',
        startedAt: { $gte: startOfDay },
        stoppedAt: { $ne: null },
        pendingClosingNote: { $ne: true },
      }).lean();

      breakMinutesToday = breakLogs.reduce((s, l) => s + effectiveDurationMinutes(l), 0);

      if (active?.type === 'break') {
        breakMinutesToday += computeDurationMinutes(active.startedAt);
      }
    }

    res.json({
      data: {
        active,
        pendingNote,
        breakMinutesToday,
        dailyBreakMinutes: dailyBreakHours * 60,
        breakOverAllowance: breakMinutesToday > dailyBreakHours * 60,
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
    if (pending.type !== 'break') {
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

    const pending = await getPendingNoteSession(userId);
    if (pending) {
      return res.status(409).json({
        message: 'Please add a closing note for your previous session first',
        data: { pendingNote: pending },
      });
    }

    const open = await getOpenSession(userId);
    if (open) {
      if (open.type === 'break') {
        return res.status(400).json({ message: 'Break already running' });
      }
      const activeSession = await TimeLog.findById(open._id)
        .populate('taskId', 'title taskCode')
        .lean();
      return res.status(409).json({
        message: 'Add a closing note for your current session before starting break',
        data: { activeSession },
      });
    }

    const log = await TimeLog.create({
      organizationId: orgId,
      userId,
      type: 'break',
      startedAt: new Date(),
    });

    res.status(201).json({ data: log, message: 'Break started' });
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

    const pending = await getPendingNoteSession(userId);
    if (pending) {
      return res.status(409).json({
        message: 'Please add a closing note for your previous session first',
        data: { pendingNote: pending },
      });
    }

    const open = await getOpenSession(userId);
    if (open) {
      if (open.type === 'training') {
        return res.status(400).json({ message: 'Training already running' });
      }
      const activeSession = await TimeLog.findById(open._id)
        .populate('taskId', 'title taskCode')
        .lean();
      return res.status(409).json({
        message: 'Add a closing note for your current session before starting training',
        data: { activeSession },
      });
    }

    const log = await TimeLog.create({
      organizationId: orgId,
      userId,
      type: 'training',
      startedAt: new Date(),
    });

    res.status(201).json({ data: log, message: 'Training started' });
  } catch (err) {
    next(err);
  }
}

async function stopTraining(req, res, next) {
  try {
    const { closingNote, closingNoteStageId } = req.body;
    const closingStage = await resolveClosingNoteStage(req, closingNoteStageId);
    if (!closingStage) {
      return res.status(400).json({ message: 'Invalid closing note stage' });
    }

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
          closingStage._id
        );
        return res.json({ data: log, message: 'Training stopped' });
      }
      return res.status(404).json({ message: 'No training in progress' });
    }

    const stoppedAt = new Date();
    open.stoppedAt = stoppedAt;
    open.systemDurationMinutes = computeDurationMinutes(open.startedAt, stoppedAt);
    open.closingNote = closingNote.trim();
    open.closingNoteStageId = closingStage._id;
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
    let canCorrect = user.role === 'super_admin' || user.role === 'owner';

    if (!canCorrect && user.organizationId) {
      const Permission = require('../models/Permission');
      const permission = await Permission.findOne({
        organizationId: user.organizationId,
        role: user.role,
        module: 'tasks',
      }).lean();
      canCorrect = Boolean(permission?.actions?.editLoggedTime);
    }

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
  getActive,
  submitPendingNote,
  startBreak,
  stopBreak,
  startTraining,
  stopTraining,
  correctDuration,
};
