const TimeLog = require('../models/TimeLog');
const Task = require('../models/Task');
const { computeDurationMinutes, effectiveDurationMinutes } = require('./timeCalc');

const SESSION_POPULATE = [
  { path: 'taskId', select: 'title taskCode' },
  { path: 'closingNoteStageId', select: 'name stageType' },
];

async function getOpenSession(userId) {
  return TimeLog.findOne({ userId, stoppedAt: null })
    .select(
      'organizationId userId type taskId startedAt stoppedAt systemDurationMinutes correctedDurationMinutes closingNote closingNoteStageId pendingClosingNote autoClosedBySwitch'
    )
    .populate(SESSION_POPULATE)
    .lean();
}

async function getPendingNoteSession(userId) {
  return TimeLog.findOne({
    userId,
    pendingClosingNote: true,
    stoppedAt: { $ne: null },
  })
    .select(
      'organizationId userId type taskId startedAt stoppedAt systemDurationMinutes correctedDurationMinutes closingNote closingNoteStageId pendingClosingNote autoClosedBySwitch'
    )
    .populate(SESSION_POPULATE)
    .lean();
}

/**
 * Force-stop an open session. Marks pendingClosingNote so the client
 * must collect a note before starting a different session type.
 */
/**
 * Owner/admin stop: closes session immediately with a fixed note (no user closing note).
 */
async function adminForceStopOpenSession(
  userId,
  { stoppedBy, stoppedByName, reason }
) {
  const open = await TimeLog.findOne({ userId, stoppedAt: null });
  if (!open) return null;

  const stoppedAt = new Date();
  const who = stoppedByName || 'Owner';
  const trimmedReason = String(reason || '').trim();
  const note = trimmedReason
    ? `Closed by ${who}: ${trimmedReason}`
    : `Closed by ${who}`;

  open.stoppedAt = stoppedAt;
  open.systemDurationMinutes = computeDurationMinutes(open.startedAt, stoppedAt);
  open.autoClosedBySwitch = false;
  open.pendingClosingNote = false;
  open.closingNote = note.slice(0, 2000);
  open.adminStoppedBy = stoppedBy || null;
  open.adminStopReason = trimmedReason.slice(0, 500);
  open.adminStoppedAt = stoppedAt;
  await open.save();

  if (open.type === 'task' && open.taskId) {
    await recomputeTaskLoggedMinutes(open.taskId);
  }

  return open.toObject();
}

async function forceStopOpenSession(userId, { requireNote = true } = {}) {
  const open = await TimeLog.findOne({ userId, stoppedAt: null });
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

  return open.toObject();
}

async function recomputeTaskLoggedMinutes(taskId) {
  const [row] = await TimeLog.aggregate([
    {
      $match: {
        taskId,
        type: 'task',
        stoppedAt: { $ne: null },
        pendingClosingNote: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $ifNull: [
              '$correctedDurationMinutes',
              { $ifNull: ['$systemDurationMinutes', 0] },
            ],
          },
        },
      },
    },
  ]);

  const total = row?.total ?? 0;
  await Task.findByIdAndUpdate(taskId, { totalLoggedMinutes: total });
  return total;
}

/** O(1) bump used on normal timer stop — prefer over full recompute. */
async function incrementTaskLoggedMinutes(taskId, minutes) {
  const delta = Number(minutes) || 0;
  if (!taskId || !delta) {
    const task = await Task.findById(taskId).select('_id totalLoggedMinutes title taskCode').lean();
    return task;
  }
  return Task.findByIdAndUpdate(
    taskId,
    { $inc: { totalLoggedMinutes: delta } },
    { new: true, select: '_id totalLoggedMinutes title taskCode' }
  ).lean();
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

async function sumBreakMinutesToday(userId, startOfDay) {
  const [row] = await TimeLog.aggregate([
    {
      $match: {
        userId,
        type: 'break',
        startedAt: { $gte: startOfDay },
        stoppedAt: { $ne: null },
        pendingClosingNote: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $ifNull: [
              '$correctedDurationMinutes',
              { $ifNull: ['$systemDurationMinutes', 0] },
            ],
          },
        },
      },
    },
  ]);
  return row?.total ?? 0;
}

module.exports = {
  getOpenSession,
  getPendingNoteSession,
  forceStopOpenSession,
  adminForceStopOpenSession,
  recomputeTaskLoggedMinutes,
  incrementTaskLoggedMinutes,
  completeClosingNote,
  sumBreakMinutesToday,
  effectiveDurationMinutes,
};
