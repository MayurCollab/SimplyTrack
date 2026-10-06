const Task = require('../models/Task');
const User = require('../models/User');
const TaskShareRequest = require('../models/TaskShareRequest');
const { orgFilter } = require('../utils/orgScope');
const {
  notifyHourShareRequested,
  notifyHourShareDecision,
} = require('../services/notifications');

const POPULATE = [
  { path: 'taskId', select: 'taskCode title budgetHours assigneeId helpingMemberId managerId isShared' },
  { path: 'requestedById', select: 'name email' },
  { path: 'toUserId', select: 'name email' },
  { path: 'reviewedById', select: 'name email' },
];

function roundHours(value) {
  return Math.round(Number(value) * 100) / 100;
}

function hoursAlmostEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.011;
}

function isTaskClosed(task) {
  return Boolean(task.completedAt || task.ignoredAt);
}

function canReviewShareRequest(req, task, request) {
  const role = req.user.role;
  if (role === 'super_admin' || role === 'owner' || role === 'manager') return true;

  const userId = String(req.user._id);
  if (task?.managerId && String(task.managerId) === userId) return true;
  if (request?.requestedById) {
    // reporting manager of requester is also allowed when loaded
  }
  return false;
}

async function create(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const userId = req.user._id;
    const { toUserId, keepHours, transferHours, requesterComment = '' } = req.body;

    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (isTaskClosed(task)) {
      return res.status(400).json({ message: 'Cannot share a completed or ignored task' });
    }
    if (String(task.assigneeId) !== String(userId)) {
      return res.status(403).json({ message: 'Only the task assignee can request hour sharing' });
    }

    const keep = roundHours(keepHours);
    const transfer = roundHours(transferHours);
    if (keep < 0 || transfer < 0.01) {
      return res.status(400).json({ message: 'Transfer hours must be at least 0.01' });
    }
    if (!hoursAlmostEqual(keep + transfer, task.budgetHours)) {
      return res.status(400).json({
        message: `Keep + transfer hours must equal budget (${task.budgetHours}h)`,
      });
    }
    if (String(toUserId) === String(userId)) {
      return res.status(400).json({ message: 'Cannot share hours with yourself' });
    }

    const toUser = await User.findOne({
      _id: toUserId,
      organizationId: orgId,
      isActive: true,
    });
    if (!toUser) return res.status(400).json({ message: 'Invalid member to share with' });

    const existingPending = await TaskShareRequest.findOne({
      taskId: task._id,
      status: 'pending',
    });
    if (existingPending) {
      return res.status(400).json({ message: 'A share request is already pending for this task' });
    }

    if (!task.managerId) {
      return res.status(400).json({
        message: 'Task has no manager assigned. Set a reporting manager for the assignee first.',
      });
    }

    const shareRequest = await TaskShareRequest.create({
      organizationId: orgId,
      taskId: task._id,
      requestedById: userId,
      toUserId,
      keepHours: keep,
      transferHours: transfer,
      requesterComment: String(requesterComment || '').trim().slice(0, 300),
      status: 'pending',
    });

    await notifyHourShareRequested({
      organizationId: orgId,
      actorId: userId,
      actorName: req.user.name,
      task,
      shareRequest,
      toUserName: toUser.name,
    });

    const populated = await TaskShareRequest.findById(shareRequest._id)
      .populate(POPULATE)
      .lean();

    res.status(201).json({
      data: populated,
      message: 'Share request sent to manager',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'A share request is already pending for this task' });
    }
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const status = req.query.status || 'pending';
    const filter = { organizationId: orgId };
    if (status && status !== 'all') filter.status = status;

    const role = req.user.role;
    const isElevated = role === 'super_admin' || role === 'owner' || role === 'manager';

    let requests = await TaskShareRequest.find(filter)
      .populate(POPULATE)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    if (!isElevated) {
      const userId = String(req.user._id);
      requests = requests.filter((r) => {
        const managerId = r.taskId?.managerId ? String(r.taskId.managerId) : '';
        const requestedBy = r.requestedById?._id
          ? String(r.requestedById._id)
          : String(r.requestedById || '');
        const toUser = r.toUserId?._id ? String(r.toUserId._id) : String(r.toUserId || '');
        return managerId === userId || requestedBy === userId || toUser === userId;
      });
    }

    res.json({ data: requests });
  } catch (err) {
    next(err);
  }
}

async function review(req, res, next, decision) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const { managerComment = '' } = req.body;
    const comment = String(managerComment || '').trim().slice(0, 300);

    const shareRequest = await TaskShareRequest.findOne({
      _id: req.params.requestId,
      organizationId: orgId,
    });
    if (!shareRequest) {
      return res.status(404).json({ message: 'Share request not found' });
    }
    if (shareRequest.status !== 'pending') {
      return res.status(400).json({ message: `Request already ${shareRequest.status}` });
    }

    const task = await Task.findOne({ _id: shareRequest.taskId, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (isTaskClosed(task)) {
      return res.status(400).json({ message: 'Cannot review share for a closed task' });
    }

    if (!canReviewShareRequest(req, task, shareRequest)) {
      return res.status(403).json({ message: 'Only the manager can approve or reject this request' });
    }

    shareRequest.status = decision;
    shareRequest.managerComment = comment;
    shareRequest.reviewedById = req.user._id;
    shareRequest.reviewedAt = new Date();
    await shareRequest.save();

    if (decision === 'approved') {
      task.helpingMemberId = shareRequest.toUserId;
      task.isShared = true;
      task.assigneeAllocatedHours = roundHours(shareRequest.keepHours);
      task.helperAllocatedHours = roundHours(shareRequest.transferHours);
      await task.save();
    }

    await notifyHourShareDecision({
      organizationId: orgId,
      actorId: req.user._id,
      actorName: req.user.name,
      task,
      shareRequest,
      decision,
      toUserId: shareRequest.toUserId,
    });

    const populated = await TaskShareRequest.findById(shareRequest._id)
      .populate(POPULATE)
      .lean();

    res.json({
      data: populated,
      message: decision === 'approved' ? 'Share request approved' : 'Share request rejected',
    });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  return review(req, res, next, 'approved');
}

async function reject(req, res, next) {
  return review(req, res, next, 'rejected');
}

module.exports = { create, list, approve, reject };
