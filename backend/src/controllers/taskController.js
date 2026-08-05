const Task = require('../models/Task');
const User = require('../models/User');
const ServiceMaster = require('../models/ServiceMaster');
const ClientMaster = require('../models/ClientMaster');
const StageMaster = require('../models/StageMaster');
const TimeLog = require('../models/TimeLog');
const { orgFilter } = require('../utils/orgScope');
const {
  getOpenSession,
  getPendingNoteSession,
  forceStopOpenSession,
  recomputeTaskLoggedMinutes,
  completeClosingNote,
} = require('../services/timer');
const { computeDurationMinutes } = require('../services/timeCalc');

const POPULATE = [
  { path: 'clientId', select: 'organizationName email' },
  { path: 'serviceId', select: 'name estimatedHours' },
  { path: 'assigneeId', select: 'name email role reportingManagerId' },
  { path: 'helpingMemberId', select: 'name email' },
  { path: 'managerId', select: 'name email' },
  { path: 'stageId', select: 'name color order' },
  { path: 'createdBy', select: 'name email' },
];

async function list(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const { status, priority, staffId, clientId, dateFrom, dateTo, search } = req.query;

    if (status) filter.stageId = status;
    if (priority) filter.priority = priority;
    if (staffId) filter.assigneeId = staffId;
    if (clientId) filter.clientId = clientId;
    if (dateFrom || dateTo) {
      filter.dueDate = {};
      if (dateFrom) filter.dueDate.$gte = new Date(dateFrom);
      if (dateTo) filter.dueDate.$lte = new Date(dateTo);
    }
    if (search) {
      filter.$or = [{ title: { $regex: search, $options: 'i' } }];
    }

    const tasks = await Task.find(filter)
      .populate(POPULATE)
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    // Enrich search by client name (post-filter if search matched titles only)
    let result = tasks;
    if (search) {
      const q = search.toLowerCase();
      result = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.clientId?.organizationName?.toLowerCase().includes(q)
      );
    }

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const task = await Task.findOne({ _id: req.params.id, ...orgFilter(req.user) })
      .populate(POPULATE)
      .lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const logs = await TimeLog.find({
      taskId: task._id,
      type: 'task',
      stoppedAt: { $ne: null },
    })
      .populate('userId', 'name email')
      .populate('correctedBy', 'name')
      .sort({ startedAt: -1 })
      .lean();

    res.json({ data: { ...task, timeLogs: logs } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const {
      title,
      description,
      clientId,
      serviceId,
      assigneeId,
      helpingMemberId,
      stageId,
      priority,
      dueDate,
      budgetHours,
    } = req.body;

    const [client, service, assignee, stage] = await Promise.all([
      ClientMaster.findOne({ _id: clientId, organizationId: orgId, isActive: true }),
      ServiceMaster.findOne({ _id: serviceId, organizationId: orgId, isActive: true }),
      User.findOne({ _id: assigneeId, organizationId: orgId, isActive: true }),
      StageMaster.findOne({ _id: stageId, organizationId: orgId, isActive: true }),
    ]);

    if (!client) return res.status(400).json({ message: 'Invalid client' });
    if (!service) return res.status(400).json({ message: 'Invalid service' });
    if (!assignee) return res.status(400).json({ message: 'Invalid assignee' });
    if (!stage) return res.status(400).json({ message: 'Invalid stage' });

    let hours = budgetHours;
    if (hours == null) hours = service.estimatedHours;

    // editBudgetHours gated by permission middleware flag - if staff without
    // permission tried to override, clamp to service estimate
    const canEditBudget =
      req.user.role === 'super_admin' ||
      req.user.role === 'owner' ||
      req.canEditBudgetHours === true;

    if (!canEditBudget) {
      hours = service.estimatedHours;
    }

    const task = await Task.create({
      organizationId: orgId,
      title,
      description: description || '',
      clientId,
      serviceId,
      assigneeId,
      helpingMemberId: helpingMemberId || null,
      managerId: assignee.reportingManagerId || null,
      stageId,
      priority: priority || 'medium',
      dueDate: new Date(dueDate),
      budgetHours: hours,
      createdBy: req.user._id,
    });

    const populated = await Task.findById(task._id).populate(POPULATE).lean();
    res.status(201).json({ data: populated, message: 'Task created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const {
      title,
      description,
      clientId,
      serviceId,
      assigneeId,
      helpingMemberId,
      stageId,
      priority,
      dueDate,
      budgetHours,
    } = req.body;

    if (title != null) task.title = title;
    if (description != null) task.description = description;
    if (priority != null) task.priority = priority;
    if (dueDate != null) task.dueDate = new Date(dueDate);
    if (helpingMemberId !== undefined) task.helpingMemberId = helpingMemberId || null;

    if (clientId) {
      const client = await ClientMaster.findOne({ _id: clientId, organizationId: orgId });
      if (!client) return res.status(400).json({ message: 'Invalid client' });
      task.clientId = clientId;
    }

    if (serviceId) {
      const service = await ServiceMaster.findOne({ _id: serviceId, organizationId: orgId });
      if (!service) return res.status(400).json({ message: 'Invalid service' });
      task.serviceId = serviceId;
    }

    if (assigneeId) {
      const assignee = await User.findOne({ _id: assigneeId, organizationId: orgId });
      if (!assignee) return res.status(400).json({ message: 'Invalid assignee' });
      task.assigneeId = assigneeId;
      task.managerId = assignee.reportingManagerId || null;
    }

    if (stageId) {
      const stage = await StageMaster.findOne({ _id: stageId, organizationId: orgId });
      if (!stage) return res.status(400).json({ message: 'Invalid stage' });
      task.stageId = stageId;
    }

    if (budgetHours != null) {
      const canEditBudget =
        req.user.role === 'super_admin' ||
        req.user.role === 'owner' ||
        req.canEditBudgetHours === true;
      if (canEditBudget) {
        task.budgetHours = budgetHours;
      }
    }

    await task.save();
    const populated = await Task.findById(task._id).populate(POPULATE).lean();
    res.json({ data: populated, message: 'Task updated' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      ...orgFilter(req.user),
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
}

async function startTimer(req, res, next) {
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

    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const open = await getOpenSession(userId);
    if (open) {
      if (open.type === 'task' && String(open.taskId) === String(task._id)) {
        return res.status(400).json({ message: 'Timer already running for this task' });
      }
      // Force-stop other session and require note before starting
      const stopped = await forceStopOpenSession(userId, { requireNote: true });
      return res.status(409).json({
        message: 'Previous session stopped - add a closing note before starting',
        data: { pendingNote: stopped },
      });
    }

    const log = await TimeLog.create({
      organizationId: orgId,
      userId,
      type: 'task',
      taskId: task._id,
      startedAt: new Date(),
    });

    const populated = await TimeLog.findById(log._id).populate('taskId', 'title').lean();
    res.status(201).json({ data: populated, message: 'Timer started' });
  } catch (err) {
    next(err);
  }
}

async function stopTimer(req, res, next) {
  try {
    const userId = req.user._id;
    const { closingNote } = req.body;

    if (!closingNote || String(closingNote).trim().length < 15) {
      return res.status(400).json({ message: 'Closing note must be at least 15 characters' });
    }

    const open = await TimeLog.findOne({
      userId,
      type: 'task',
      taskId: req.params.id,
      stoppedAt: null,
    });

    if (!open) {
      // Maybe completing a pending note for this task
      const pending = await TimeLog.findOne({
        userId,
        type: 'task',
        taskId: req.params.id,
        pendingClosingNote: true,
      });
      if (pending) {
        const completed = await completeClosingNote(pending._id, userId, closingNote.trim());
        const task = await Task.findById(req.params.id).populate(POPULATE).lean();
        return res.json({
          data: { timeLog: completed, task },
          message: 'Timer stopped',
        });
      }
      return res.status(404).json({ message: 'No running timer for this task' });
    }

    const stoppedAt = new Date();
    open.stoppedAt = stoppedAt;
    open.systemDurationMinutes = computeDurationMinutes(open.startedAt, stoppedAt);
    open.closingNote = closingNote.trim();
    open.pendingClosingNote = false;
    await open.save();

    await recomputeTaskLoggedMinutes(open.taskId);
    const task = await Task.findById(open.taskId).populate(POPULATE).lean();

    res.json({ data: { timeLog: open, task }, message: 'Timer stopped' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  startTimer,
  stopTimer,
};
