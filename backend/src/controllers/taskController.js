const Task = require('../models/Task');
const User = require('../models/User');
const mongoose = require('mongoose');
const ServiceMaster = require('../models/ServiceMaster');
const ClientMaster = require('../models/ClientMaster');
const StageMaster = require('../models/StageMaster');
const AlertMaster = require('../models/AlertMaster');
const TimeLog = require('../models/TimeLog');
const { orgFilter } = require('../utils/orgScope');
const {
  getOpenSession,
  getPendingNoteSession,
  recomputeTaskLoggedMinutes,
  completeClosingNote,
} = require('../services/timer');
const { computeDurationMinutes } = require('../services/timeCalc');
const { generateTaskCode } = require('../services/taskCode');
const {
  formatCompliancePeriodValue,
  buildTaskTitle,
} = require('../services/taskTitle');
const { computeTargetDate, canEditTargetDate } = require('../services/targetDate');
const { findStageBySystemKey } = require('../services/stages');
const {
  getActiveRecurrence,
  createRecurrenceFromTask,
  listPendingSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  checkRecurringEligibility,
} = require('../services/recurringTasks');
const {
  buildReviewPointHistory,
  historyFromCreatedPoints,
} = require('../services/reviewPoints');
const {
  extractMentions,
  loadMentionUsers,
  withReviewPointMentions,
} = require('../services/mentions');

const POPULATE = [
  { path: 'clientId', select: 'organizationName email' },
  { path: 'serviceId', select: 'name estimatedHours compliancePeriodType turnaroundBusinessDays' },
  { path: 'assigneeId', select: 'name email role reportingManagerId' },
  { path: 'helpingMemberId', select: 'name email' },
  { path: 'managerId', select: 'name email' },
  { path: 'stageId', select: 'name color order systemKey' },
  { path: 'createdBy', select: 'name email' },
  { path: 'reviewPointsHistory.changedBy', select: 'name email' },
  { path: 'alertId', select: 'name days' },
];

function resolveComplianceAndTitle({ client, service, compliancePeriodInput }) {
  const periodValue = formatCompliancePeriodValue(
    compliancePeriodInput,
    service.compliancePeriodType
  );
  const title = buildTaskTitle(client.organizationName, service.name, periodValue);
  return { compliancePeriodValue: periodValue, title };
}

function parseOptionalDate(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isTaskClosed(task) {
  return Boolean(task.completedAt || task.ignoredAt);
}

function canManageLifecycle(req, action) {
  if (req.user.role === 'super_admin' || req.user.role === 'owner') return true;
  if (action === 'complete') return req.canCompleteTask === true;
  if (action === 'ignore') return req.canIgnoreTask === true;
  return false;
}

async function list(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const {
      status,
      priority,
      staffId,
      clientId,
      dateFrom,
      dateTo,
      targetFrom,
      targetTo,
      lifecycle,
      search,
    } = req.query;

    if (status) filter.stageId = status;
    if (priority) filter.priority = priority;
    if (staffId) filter.assigneeId = staffId;
    if (clientId) filter.clientId = clientId;

    if (dateFrom || dateTo) {
      filter.dueDate = {};
      if (dateFrom) filter.dueDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.dueDate.$lte = end;
      }
    }

    if (targetFrom || targetTo) {
      filter.targetDate = {};
      if (targetFrom) filter.targetDate.$gte = new Date(targetFrom);
      if (targetTo) {
        const end = new Date(targetTo);
        end.setHours(23, 59, 59, 999);
        filter.targetDate.$lte = end;
      }
    }

    if (lifecycle === 'open') {
      filter.completedAt = null;
      filter.ignoredAt = null;
    } else if (lifecycle === 'completed') {
      filter.completedAt = { $ne: null };
    } else if (lifecycle === 'ignored') {
      filter.ignoredAt = { $ne: null };
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { taskCode: { $regex: search, $options: 'i' } },
      ];
    }

    const tasks = await Task.find(filter)
      .populate(POPULATE)
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    let result = tasks;
    if (search) {
      const q = search.toLowerCase();
      result = tasks.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.taskCode?.toLowerCase().includes(q) ||
          t.clientId?.organizationName?.toLowerCase().includes(q)
      );
    }

    if (result.length) {
      const lastLogs = await TimeLog.aggregate([
        {
          $match: {
            organizationId: filter.organizationId,
            type: 'task',
            taskId: { $in: result.map((t) => t._id) },
          },
        },
        { $sort: { startedAt: -1 } },
        {
          $group: {
            _id: '$taskId',
            lastStartedAt: { $first: '$startedAt' },
            lastStoppedAt: { $first: '$stoppedAt' },
          },
        },
      ]);
      const lastByTask = new Map(lastLogs.map((log) => [String(log._id), log]));
      result = result.map((task) => {
        const last = lastByTask.get(String(task._id));
        return {
          ...task,
          lastTimerStartedAt: last?.lastStartedAt || null,
          lastTimerStoppedAt: last?.lastStoppedAt || null,
        };
      });
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
      description,
      reviewPoints,
      clientId,
      serviceId,
      assigneeId,
      helpingMemberId,
      stageId,
      priority,
      compliancePeriodInput,
      taskReceiveDate,
      querySentDate,
      replyReceivedDate,
      targetDate,
      dueDate,
      budgetHours,
      isRecurring,
      recurrenceFrequency,
      recurrenceStartDate,
      recurrenceEndDate,
      alertId,
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

    let resolvedAlertId = null;
    if (alertId && mongoose.Types.ObjectId.isValid(alertId)) {
      const alert = await AlertMaster.findOne({
        _id: alertId,
        organizationId: orgId,
        isActive: true,
      });
      if (!alert) return res.status(400).json({ message: 'Invalid alert' });
      resolvedAlertId = alert._id;
    }

    if (stage.systemKey === 'completed' || stage.systemKey === 'ignored') {
      return res.status(400).json({
        message:
          stage.systemKey === 'completed'
            ? 'Use Mark Complete to complete a task'
            : 'Use Ignore Task to ignore a task',
      });
    }

    const parsedQuerySent = parseOptionalDate(querySentDate);
    const parsedReplyReceived = parseOptionalDate(replyReceivedDate);

    if (stage.systemKey === 'query_sent' && !parsedQuerySent) {
      return res.status(400).json({
        message: 'Query Sent Date is required when status is Query Sent',
        code: 'QUERY_SENT_DATE_REQUIRED',
      });
    }

    const { title, compliancePeriodValue: periodValue } = resolveComplianceAndTitle({
      client,
      service,
      compliancePeriodInput,
    });

    if (!title) {
      return res.status(400).json({
        message: 'Could not generate task title — check client, service, and compliance period',
      });
    }

    let hours = budgetHours;
    if (hours == null) hours = service.estimatedHours;

    const canEditBudget =
      req.user.role === 'super_admin' ||
      req.user.role === 'owner' ||
      req.canEditBudgetHours === true;

    if (!canEditBudget) {
      hours = service.estimatedHours;
    }

    const receiveDate = new Date(taskReceiveDate);
    const computedTarget = computeTargetDate(receiveDate, service.turnaroundBusinessDays);
    let finalTarget = computedTarget;
    if (targetDate != null && canEditTargetDate(req)) {
      finalTarget = new Date(targetDate);
    }

    const taskCode = await generateTaskCode(orgId);
    const mentionUsers = await loadMentionUsers(User, orgId);
    const incomingPoints = Array.isArray(reviewPoints) ? reviewPoints : [];

    const task = await Task.create({
      organizationId: orgId,
      taskCode,
      title,
      description: description || '',
      descriptionMentions: extractMentions(description || '', mentionUsers),
      reviewPoints: withReviewPointMentions(incomingPoints, mentionUsers),
      clientId,
      serviceId,
      assigneeId,
      helpingMemberId: helpingMemberId || null,
      managerId: assignee.reportingManagerId || null,
      stageId,
      priority: priority || 'medium',
      compliancePeriodInput: String(compliancePeriodInput).trim(),
      compliancePeriodValue: periodValue,
      taskReceiveDate: receiveDate,
      querySentDate: parsedQuerySent,
      replyReceivedDate: parsedReplyReceived,
      targetDate: finalTarget,
      dueDate: new Date(dueDate || finalTarget || receiveDate),
      budgetHours: hours,
      alertId: isRecurring ? resolvedAlertId : null,
      createdBy: req.user._id,
    });

    if (isRecurring) {
      const priorCount = await Task.countDocuments({
        organizationId: orgId,
        clientId,
        serviceId,
        _id: { $ne: task._id },
      });
      const existingRecurrence = await getActiveRecurrence(orgId, clientId, serviceId);

      if (priorCount === 0 && !existingRecurrence) {
        const recurrence = await createRecurrenceFromTask({
          organizationId: orgId,
          task,
          service,
          frequency: recurrenceFrequency,
          startDate: recurrenceStartDate || receiveDate,
          endDate: recurrenceEndDate || null,
          alertId: resolvedAlertId,
        });
        task.recurrenceId = recurrence._id;
      }
    }

    if (task.reviewPoints.length) {
      task.reviewPointsHistory.push(
        ...historyFromCreatedPoints(task.reviewPoints, req.user._id)
      );
    }

    if (task.recurrenceId || task.reviewPointsHistory.length) {
      await task.save();
    }

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
      description,
      reviewPoints,
      clientId,
      serviceId,
      assigneeId,
      helpingMemberId,
      stageId,
      priority,
      compliancePeriodInput,
      taskReceiveDate,
      querySentDate,
      replyReceivedDate,
      targetDate,
      dueDate,
      budgetHours,
    } = req.body;

    // taskCode and title are never accepted from the client — title is regenerated below
    const mentionUsers =
      description != null || reviewPoints != null
        ? await loadMentionUsers(User, orgId)
        : [];
    if (description != null) {
      task.description = description;
      task.descriptionMentions = extractMentions(description, mentionUsers);
    }
    if (reviewPoints != null) {
      const incoming = withReviewPointMentions(
        Array.isArray(reviewPoints) ? reviewPoints : [],
        mentionUsers
      );
      const previousById = new Map(
        (task.reviewPoints || [])
          .filter((point) => point._id)
          .map((point) => [String(point._id), point])
      );
      const merged = incoming.map((point) => {
        const existing = point._id ? previousById.get(String(point._id)) : null;
        return {
          ...point,
          status: existing?.status || point.status || 'pending',
          notes: existing?.notes ?? point.notes ?? '',
        };
      });
      const historyEntries = buildReviewPointHistory({
        previous: task.reviewPoints,
        next: merged,
        userId: req.user._id,
      });
      task.reviewPoints = merged;
      if (historyEntries.length) {
        task.reviewPointsHistory.push(...historyEntries);
      }
    }
    if (priority != null) task.priority = priority;
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

      if (stage.systemKey === 'completed' || stage.systemKey === 'ignored') {
        return res.status(400).json({
          message:
            stage.systemKey === 'completed'
              ? 'Use Mark Complete to complete a task'
              : 'Use Ignore Task to ignore a task',
        });
      }

      if (isTaskClosed(task)) {
        return res.status(400).json({
          message: 'Cannot change status of a completed or ignored task',
        });
      }

      const previousStage = await StageMaster.findById(task.stageId).lean();
      const stageChanging = String(stageId) !== String(task.stageId);

      // Apply incoming dates before validating stage transitions
      if (querySentDate !== undefined) {
        task.querySentDate = parseOptionalDate(querySentDate);
      }
      if (replyReceivedDate !== undefined) {
        task.replyReceivedDate = parseOptionalDate(replyReceivedDate);
      }

      if (stageChanging) {
        if (stage.systemKey === 'query_sent' && !task.querySentDate) {
          return res.status(400).json({
            message: 'Query Sent Date is required when status is Query Sent',
            code: 'QUERY_SENT_DATE_REQUIRED',
          });
        }

        if (
          previousStage?.systemKey === 'waiting_client' &&
          stage.systemKey !== 'waiting_client' &&
          !task.replyReceivedDate
        ) {
          return res.status(400).json({
            message: 'Reply Received Date is required when leaving Waiting for Client',
            code: 'REPLY_RECEIVED_DATE_REQUIRED',
          });
        }
      }

      task.stageId = stageId;
    } else {
      if (querySentDate !== undefined) {
        task.querySentDate = parseOptionalDate(querySentDate);
      }
      if (replyReceivedDate !== undefined) {
        task.replyReceivedDate = parseOptionalDate(replyReceivedDate);
      }
    }

    if (compliancePeriodInput != null) {
      task.compliancePeriodInput = String(compliancePeriodInput).trim();
    }
    if (taskReceiveDate != null) task.taskReceiveDate = new Date(taskReceiveDate);
    if (dueDate != null) {
      task.dueDate = new Date(dueDate);
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

    const service = await ServiceMaster.findById(task.serviceId);
    const receiveOrServiceChanged = taskReceiveDate != null || serviceId != null;

    if (targetDate != null && canEditTargetDate(req)) {
      task.targetDate = new Date(targetDate);
    } else if (receiveOrServiceChanged && service && task.taskReceiveDate) {
      task.targetDate = computeTargetDate(
        task.taskReceiveDate,
        service.turnaroundBusinessDays
      );
    }

    if (dueDate == null && task.targetDate) {
      task.dueDate = task.targetDate;
    }

    const titleFieldsChanged =
      clientId != null ||
      serviceId != null ||
      compliancePeriodInput != null;

    if (titleFieldsChanged) {
      const [client, svc] = await Promise.all([
        ClientMaster.findById(task.clientId),
        ServiceMaster.findById(task.serviceId),
      ]);
      if (client && svc) {
        const resolved = resolveComplianceAndTitle({
          client,
          service: svc,
          compliancePeriodInput: task.compliancePeriodInput,
        });
        task.compliancePeriodValue = resolved.compliancePeriodValue;
        task.title = resolved.title;
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

    if (isTaskClosed(task)) {
      return res.status(400).json({
        message: 'Cannot start timer on a completed or ignored task',
      });
    }

    const open = await getOpenSession(userId);
    if (open) {
      if (open.type === 'task' && String(open.taskId) === String(task._id)) {
        return res.status(400).json({ message: 'Timer already running for this task' });
      }
      const activeSession = await TimeLog.findById(open._id)
        .populate('taskId', 'title taskCode')
        .lean();
      return res.status(409).json({
        message: 'Add a closing note for your current session before starting a new timer',
        data: { activeSession },
      });
    }

    const log = await TimeLog.create({
      organizationId: orgId,
      userId,
      type: 'task',
      taskId: task._id,
      startedAt: new Date(),
    });

    const populated = await TimeLog.findById(log._id).populate('taskId', 'title taskCode').lean();
    res.status(201).json({ data: populated, message: 'Timer started' });
  } catch (err) {
    next(err);
  }
}

async function stopTimer(req, res, next) {
  try {
    const userId = req.user._id;
    const { closingNote, closingNoteStageId } = req.body;

    if (!closingNote || String(closingNote).trim().length < 10) {
      return res.status(400).json({ message: 'Closing note must be at least 10 characters' });
    }
    const closingStage = await StageMaster.findOne({
      _id: closingNoteStageId,
      organizationId: orgFilter(req.user).organizationId,
      stageType: 'closing_note',
      isActive: true,
    });
    if (!closingStage) {
      return res.status(400).json({ message: 'Invalid closing note stage' });
    }

    const open = await TimeLog.findOne({
      userId,
      type: 'task',
      taskId: req.params.id,
      stoppedAt: null,
    });

    if (!open) {
      const pending = await TimeLog.findOne({
        userId,
        type: 'task',
        taskId: req.params.id,
        pendingClosingNote: true,
      });
      if (pending) {
        const completed = await completeClosingNote(
          pending._id,
          userId,
          closingNote.trim(),
          closingStage._id
        );
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
    open.closingNoteStageId = closingStage._id;
    open.pendingClosingNote = false;
    await open.save();

    await recomputeTaskLoggedMinutes(open.taskId);
    const task = await Task.findById(open.taskId).populate(POPULATE).lean();

    res.json({ data: { timeLog: open, task }, message: 'Timer stopped' });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    if (!canManageLifecycle(req, 'complete')) {
      return res.status(403).json({ message: 'You do not have permission to complete tasks' });
    }

    const orgId = orgFilter(req.user).organizationId;
    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (task.ignoredAt) {
      return res.status(400).json({ message: 'Cannot complete an ignored task' });
    }
    if (task.completedAt) {
      return res.status(400).json({ message: 'Task is already completed' });
    }

    const completionDate = parseOptionalDate(req.body.completionDate);
    if (!completionDate) {
      return res.status(400).json({ message: 'Completion date is required' });
    }

    const completedStage = await findStageBySystemKey(orgId, 'completed');
    if (!completedStage) {
      return res.status(400).json({
        message: 'Completed stage is missing — check Stage Master',
      });
    }

    task.completedAt = completionDate;
    task.ignoredAt = null;
    task.ignoreRemarks = '';
    task.stageId = completedStage._id;
    await task.save();

    const populated = await Task.findById(task._id).populate(POPULATE).lean();
    res.json({ data: populated, message: 'Task completed' });
  } catch (err) {
    next(err);
  }
}

async function ignore(req, res, next) {
  try {
    if (!canManageLifecycle(req, 'ignore')) {
      return res.status(403).json({ message: 'You do not have permission to ignore tasks' });
    }

    const orgId = orgFilter(req.user).organizationId;
    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (task.completedAt) {
      return res.status(400).json({ message: 'Cannot ignore a completed task' });
    }
    if (task.ignoredAt) {
      return res.status(400).json({ message: 'Task is already ignored' });
    }

    const ignoreDate = parseOptionalDate(req.body.ignoreDate);
    if (!ignoreDate) {
      return res.status(400).json({ message: 'Ignore date is required' });
    }

    const remarks = String(req.body.remarks || '').trim();
    if (!remarks) {
      return res.status(400).json({ message: 'Remarks are required' });
    }

    const ignoredStage = await findStageBySystemKey(orgId, 'ignored');
    if (!ignoredStage) {
      return res.status(400).json({
        message: 'Ignored stage is missing — check Stage Master',
      });
    }

    task.ignoredAt = ignoreDate;
    task.ignoreRemarks = remarks;
    task.completedAt = null;
    task.stageId = ignoredStage._id;
    await task.save();

    const populated = await Task.findById(task._id).populate(POPULATE).lean();
    res.json({ data: populated, message: 'Task ignored' });
  } catch (err) {
    next(err);
  }
}

async function checkRecurring(req, res, next) {
  try {
    const data = await checkRecurringEligibility(req);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function listSuggestions(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const data = await listPendingSuggestions(orgId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function acceptSuggestionHandler(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const task = await acceptSuggestion(req.params.id, orgId, req.user._id);
    const populated = await Task.findById(task._id).populate(POPULATE).lean();
    res.status(201).json({ data: populated, message: 'Suggested task created' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

async function dismissSuggestionHandler(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    await dismissSuggestion(req.params.id, orgId);
    res.json({ message: 'Suggestion dismissed' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
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
  complete,
  ignore,
  checkRecurring,
  listSuggestions,
  acceptSuggestion: acceptSuggestionHandler,
  dismissSuggestion: dismissSuggestionHandler,
};
