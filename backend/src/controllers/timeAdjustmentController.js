const TimeLog = require('../models/TimeLog');
const Task = require('../models/Task');
const TimeAdjustmentRequest = require('../models/TimeAdjustmentRequest');
const { orgFilter } = require('../utils/orgScope');
const { computeDurationMinutes } = require('../services/timeCalc');
const { logsOverlap, applyApprovedRequest } = require('../services/timeAdjustmentApply');
const {
  notifyTimeAdjustmentSubmitted,
  notifyTimeAdjustmentDecision,
} = require('../services/notifications');
const { maskActors, visibleActorName } = require('../services/platformAccess');

const POPULATE = [
  { path: 'requestedById', select: 'name email' },
  { path: 'reviewedById', select: 'name email' },
  { path: 'timeLogId' },
  { path: 'taskId', select: 'taskCode title' },
  { path: 'appliedTimeLogId' },
];

async function nextTicketNumber(orgId) {
  const count = await TimeAdjustmentRequest.countDocuments({ organizationId: orgId });
  return `TAR-${String(count + 1).padStart(6, '0')}`;
}

function isOwnerReviewer(user) {
  return user.role === 'super_admin' || user.role === 'owner';
}

async function create(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const userId = req.user._id;
    const {
      kind,
      timeLogId,
      type,
      taskId,
      requestedStartedAt,
      requestedStoppedAt,
      description,
    } = req.body;

    const started = new Date(requestedStartedAt);
    const stopped = new Date(requestedStoppedAt);
    if (Number.isNaN(started.getTime()) || Number.isNaN(stopped.getTime()) || stopped <= started) {
      return res.status(400).json({ message: 'Stop time must be after start time' });
    }

    const duration = computeDurationMinutes(started, stopped);
    if (duration > 24 * 60) {
      return res.status(400).json({ message: 'Requested duration cannot exceed 24 hours' });
    }

    const desc = String(description || '').trim();
    if (desc.length < 10) {
      return res.status(400).json({ message: 'Description must be at least 10 characters' });
    }

    let logType = type;
    let logTaskId = taskId || null;
    let originalStartedAt = null;
    let originalStoppedAt = null;
    let originalDurationMinutes = null;

    if (kind === 'correct_existing') {
      if (!timeLogId) {
        return res.status(400).json({ message: 'Select a timer record to adjust' });
      }
      const log = await TimeLog.findOne({
        _id: timeLogId,
        userId,
        organizationId: orgId,
      });
      if (!log) return res.status(404).json({ message: 'Time log not found' });
      if (!log.stoppedAt || log.pendingClosingNote) {
        return res.status(400).json({
          message: 'Only completed sessions can be adjusted (not running or pending note)',
        });
      }

      logType = log.type;
      logTaskId = log.taskId || null;
      originalStartedAt = log.startedAt;
      originalStoppedAt = log.stoppedAt;
      originalDurationMinutes =
        log.correctedDurationMinutes != null
          ? log.correctedDurationMinutes
          : log.systemDurationMinutes;

      const pending = await TimeAdjustmentRequest.findOne({
        timeLogId: log._id,
        status: 'pending',
      }).lean();
      if (pending) {
        return res.status(400).json({ message: 'A pending request already exists for this session' });
      }
    } else if (kind === 'add_missing') {
      if (!logType || !['task', 'break', 'training'].includes(logType)) {
        return res.status(400).json({ message: 'Session type is required' });
      }
      if (logType === 'task' && !logTaskId) {
        return res.status(400).json({ message: 'Task is required for missing task time' });
      }
      if (logType === 'task') {
        const task = await Task.findOne({ _id: logTaskId, organizationId: orgId }).lean();
        if (!task) return res.status(400).json({ message: 'Invalid task' });
      }
    } else {
      return res.status(400).json({ message: 'Invalid request kind' });
    }

    const overlap = await logsOverlap(userId, started, stopped, kind === 'correct_existing' ? timeLogId : null);
    if (overlap) {
      return res.status(400).json({ message: 'Requested times overlap another session' });
    }

    const ticketNumber = await nextTicketNumber(orgId);

    const request = await TimeAdjustmentRequest.create({
      organizationId: orgId,
      ticketNumber,
      requestedById: userId,
      kind,
      timeLogId: kind === 'correct_existing' ? timeLogId : null,
      type: logType,
      taskId: logType === 'task' ? logTaskId : null,
      originalStartedAt,
      originalStoppedAt,
      originalDurationMinutes,
      requestedStartedAt: started,
      requestedStoppedAt: stopped,
      description: desc.slice(0, 2000),
      status: 'pending',
    });

    await notifyTimeAdjustmentSubmitted({
      organizationId: orgId,
      actorId: userId,
      actorName: visibleActorName(req.user, orgId),
      request,
    });

    const { publishOrgEvent } = require('../services/realtime');
    publishOrgEvent(
      orgId,
      {
        type: 'time_adjustment',
        reason: 'submitted',
        timeAdjustmentRequestId: request._id,
        actorId: userId,
      },
      { excludeUserId: userId }
    );

    const populated = await TimeAdjustmentRequest.findById(request._id).populate(POPULATE).lean();
    res.status(201).json({
      data: await maskActors(populated),
      message: 'Adjustment request submitted',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Duplicate pending request for this session' });
    }
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const status = req.query.status || 'all';
    const filter = { organizationId: orgId };
    if (status && status !== 'all') filter.status = status;

    if (!isOwnerReviewer(req.user)) {
      filter.requestedById = req.user._id;
    }

    const requests = await TimeAdjustmentRequest.find(filter)
      .populate(POPULATE)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ data: await maskActors(requests) });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const request = await TimeAdjustmentRequest.findOne({
      _id: req.params.id,
      organizationId: orgId,
    })
      .populate(POPULATE)
      .lean();

    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (
      !isOwnerReviewer(req.user) &&
      String(request.requestedById?._id || request.requestedById) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json({ data: await maskActors(request) });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const request = await TimeAdjustmentRequest.findOne({
      _id: req.params.id,
      organizationId: orgId,
    });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request already ${request.status}` });
    }

    const isRequester = String(request.requestedById) === String(req.user._id);
    const isOwner = isOwnerReviewer(req.user);
    if (!isRequester && !isOwner) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    request.status = 'cancelled';
    if (isOwner && !isRequester) {
      request.reviewedById = req.user._id;
      request.reviewedAt = new Date();
      request.reviewerComment = String(req.body.reviewerComment || 'Cancelled by owner').trim();
    }
    await request.save();

    const populated = await TimeAdjustmentRequest.findById(request._id).populate(POPULATE).lean();
    res.json({ data: await maskActors(populated), message: 'Request cancelled' });
  } catch (err) {
    next(err);
  }
}

async function review(req, res, next, decision) {
  try {
    if (!isOwnerReviewer(req.user)) {
      return res.status(403).json({ message: 'Only the owner can review adjustment requests' });
    }

    const orgId = orgFilter(req.user).organizationId;
    const { reviewerComment = '', appliedStartedAt, appliedStoppedAt } = req.body;

    const request = await TimeAdjustmentRequest.findOne({
      _id: req.params.id,
      organizationId: orgId,
    });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request already ${request.status}` });
    }

    request.reviewedById = req.user._id;
    request.reviewedAt = new Date();
    request.reviewerComment = String(reviewerComment || '').trim().slice(0, 500);

    if (decision === 'rejected') {
      request.status = 'rejected';
      await request.save();
      await notifyTimeAdjustmentDecision({
        organizationId: orgId,
        actorId: req.user._id,
        actorName: visibleActorName(req.user, orgId),
        request,
        decision: 'rejected',
      });
      const { publishOrgEvent } = require('../services/realtime');
      publishOrgEvent(
        orgId,
        {
          type: 'time_adjustment',
          reason: 'rejected',
          timeAdjustmentRequestId: request._id,
          actorId: req.user._id,
        },
        { excludeUserId: req.user._id }
      );
      const populated = await TimeAdjustmentRequest.findById(request._id).populate(POPULATE).lean();
      return res.json({
        data: await maskActors(populated),
        message: 'Request rejected',
      });
    }

    if (appliedStartedAt && appliedStoppedAt) {
      request.appliedStartedAt = new Date(appliedStartedAt);
      request.appliedStoppedAt = new Date(appliedStoppedAt);
    } else {
      request.appliedStartedAt = request.requestedStartedAt;
      request.appliedStoppedAt = request.requestedStoppedAt;
    }

    request.status = 'approved';
    await applyApprovedRequest(request);

    await notifyTimeAdjustmentDecision({
      organizationId: orgId,
      actorId: req.user._id,
      actorName: visibleActorName(req.user, orgId),
      request,
      decision: 'approved',
    });

    const { publishOrgEvent } = require('../services/realtime');
    publishOrgEvent(
      orgId,
      {
        type: 'time_adjustment',
        reason: 'approved',
        timeAdjustmentRequestId: request._id,
        actorId: req.user._id,
      },
      { excludeUserId: req.user._id }
    );

    const populated = await TimeAdjustmentRequest.findById(request._id).populate(POPULATE).lean();
    res.json({
      data: await maskActors(populated),
      message: 'Request approved and time updated',
    });

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
}

async function approve(req, res, next) {
  return review(req, res, next, 'approved');
}

async function reject(req, res, next) {
  return review(req, res, next, 'rejected');
}

module.exports = { create, list, getOne, cancel, approve, reject };
