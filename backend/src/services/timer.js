const TimeLog = require('../models/TimeLog');
const Task = require('../models/Task');
const { computeDurationMinutes, effectiveDurationMinutes } = require('./timeCalc');

async function getOpenSession(userId) {
  return TimeLog.findOne({ userId, stoppedAt: null })
    .populate('taskId', 'title')
    .populate('closingNoteStageId', 'name stageType');
}

async function getPendingNoteSession(userId) {
  return TimeLog.findOne({
    userId,
    pendingClosingNote: true,
    stoppedAt: { $ne: null },
  })
    .populate('taskId', 'title')
    .populate('closingNoteStageId', 'name stageType');
}

/**
 * Force-stop an open session. Marks pendingClosingNote so the client
 * must collect a note before starting a different session type.
 */
async function forceStopOpenSession(userId, { requireNote = true } = {}) {
  const open = await getOpenSession(userId);
  if (!open) return null;

  const stoppedAt = new Date();
  open.stoppedAt = stoppedAt;
  open.systemDurationMinutes = computeDurationMinutes(open.startedAt, stoppedAt);
  open.autoClosedBySwitch = true;
  open.pendingClosingNote = requireNote;
  if (!requireNote) {
    open.closingNote = open.closingNote || 'Auto-closed';
  }
  await open.save();

  if (open.type === 'task' && open.taskId && !requireNote) {
    await recomputeTaskLoggedMinutes(open.taskId);
  }

  return open;
}

async function recomputeTaskLoggedMinutes(taskId) {
  const logs = await TimeLog.find({
    taskId,
    type: 'task',
    stoppedAt: { $ne: null },
    pendingClosingNote: { $ne: true },
  }).lean();

  const total = logs.reduce((sum, log) => sum + effectiveDurationMinutes(log), 0);
  await Task.findByIdAndUpdate(taskId, { totalLoggedMinutes: total });
  return total;
}

async function completeClosingNote(logId, userId, closingNote, closingNoteStageId) {
  const log = await TimeLog.findOne({ _id: logId, userId });
  if (!log) {
    const err = new Error('Time log not found');
    err.status = 404;
    throw err;
  }
  if (!log.stoppedAt) {
    const err = new Error('Session is still running');
    err.status = 400;
    throw err;
  }

  log.closingNote = closingNote;
  log.closingNoteStageId = closingNoteStageId || null;
  log.pendingClosingNote = false;
  await log.save();

  if (log.type === 'task' && log.taskId) {
    await recomputeTaskLoggedMinutes(log.taskId);
  }

  return log;
}

module.exports = {
  getOpenSession,
  getPendingNoteSession,
  forceStopOpenSession,
  recomputeTaskLoggedMinutes,
  completeClosingNote,
};
