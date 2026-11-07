const TimeLog = require('../models/TimeLog');
const { computeDurationMinutes } = require('./timeCalc');
const { recomputeTaskLoggedMinutes } = require('./timer');

async function logsOverlap(userId, startedAt, stoppedAt, excludeLogId = null) {
  const filter = {
    userId,
    startedAt: { $lt: stoppedAt },
    $or: [{ stoppedAt: null }, { stoppedAt: { $gt: startedAt } }],
  };
  if (excludeLogId) {
    filter._id = { $ne: excludeLogId };
  }
  const hit = await TimeLog.findOne(filter).select('_id').lean();
  return Boolean(hit);
}

async function applyApprovedRequest(request) {
  const startedAt = request.appliedStartedAt || request.requestedStartedAt;
  const stoppedAt = request.appliedStoppedAt || request.requestedStoppedAt;

  if (!startedAt || !stoppedAt || stoppedAt <= startedAt) {
    const err = new Error('Invalid applied time range');
    err.status = 400;
    throw err;
  }

  const duration = computeDurationMinutes(startedAt, stoppedAt);
  const userId = request.requestedById;

  const overlap = await logsOverlap(userId, startedAt, stoppedAt, request.timeLogId || null);
  if (overlap) {
    const err = new Error('Applied times overlap another session');
    err.status = 400;
    throw err;
  }

  if (request.kind === 'correct_existing' && request.timeLogId) {
    const log = await TimeLog.findOne({
      _id: request.timeLogId,
      userId,
      organizationId: request.organizationId,
    });
    if (!log) {
      const err = new Error('Original time log not found');
      err.status = 404;
      throw err;
    }
    if (!log.stoppedAt || log.pendingClosingNote) {
      const err = new Error('Cannot adjust an open or pending-note session');
      err.status = 400;
      throw err;
    }

    const prevTaskId = log.taskId;

    log.startedAt = startedAt;
    log.stoppedAt = stoppedAt;
    log.systemDurationMinutes = duration;
    log.correctedDurationMinutes = null;
    log.correctedBy = request.reviewedById;
    log.correctedAt = new Date();
    log.timeAdjustmentRequestId = request._id;
    await log.save();

    if (log.type === 'task' && log.taskId) {
      await recomputeTaskLoggedMinutes(log.taskId);
    }
    if (prevTaskId && String(prevTaskId) !== String(log.taskId)) {
      await recomputeTaskLoggedMinutes(prevTaskId);
    }

    request.appliedTimeLogId = log._id;
    request.appliedAt = new Date();
    request.status = 'approved';
    await request.save();

    return log;
  }

  if (request.kind === 'add_missing') {
    const log = await TimeLog.create({
      organizationId: request.organizationId,
      userId,
      type: request.type,
      taskId: request.type === 'task' ? request.taskId : null,
      startedAt,
      stoppedAt,
      systemDurationMinutes: duration,
      closingNote: `Added via adjustment ${request.ticketNumber}`,
      pendingClosingNote: false,
      timeAdjustmentRequestId: request._id,
      correctedBy: request.reviewedById,
      correctedAt: new Date(),
    });

    if (log.type === 'task' && log.taskId) {
      await recomputeTaskLoggedMinutes(log.taskId);
    }

    request.appliedTimeLogId = log._id;
    request.appliedAt = new Date();
    request.status = 'approved';
    await request.save();

    return log;
  }

  const err = new Error('Unsupported adjustment kind');
  err.status = 400;
  throw err;
}

module.exports = { applyApprovedRequest, logsOverlap };
