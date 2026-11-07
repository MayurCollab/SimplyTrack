const Task = require('../models/Task');
const User = require('../models/User');
const mongoose = require('mongoose');
const ServiceMaster = require('../models/ServiceMaster');
const ClientMaster = require('../models/ClientMaster');
const ProjectMaster = require('../models/ProjectMaster');
const StageMaster = require('../models/StageMaster');
const TimeLog = require('../models/TimeLog');
const { orgFilter } = require('../utils/orgScope');
const {
  getOpenSession,
  getPendingNoteSession,
  incrementTaskLoggedMinutes,
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
const {
  collectTaskMentionIds,
  notifyNewTaskMentions,
  notifyReviewPointReply,
  notifyTaskAssignment,
} = require('../services/notifications');
const { maskActors, visibleActorName } = require('../services/platformAccess');
const { publishOrgEvent } = require('../services/realtime');

const POPULATE = [
  {
    path: 'projectId',
    select: 'name clientId serviceIds isActive',
  },
  { path: 'clientId', select: 'organizationName email' },
  { path: 'serviceId', select: 'name estimatedHours compliancePeriodType turnaroundBusinessDays' },
  { path: 'assigneeId', select: 'name email role reportingManagerId' },
  { path: 'helpingMemberId', select: 'name email' },
  { path: 'managerId', select: 'name email' },
  { path: 'stageId', select: 'name color order systemKey' },
  { path: 'createdBy', select: 'name email' },
  { path: 'reviewPointsHistory.changedBy', select: 'name email' },
  { path: 'descriptionHistory.changedBy', select: 'name email' },
];

/** Lighter populate for lifecycle actions (complete/ignore) — skips heavy history paths */
const LIFECYCLE_POPULATE = [
  { path: 'projectId', select: 'name clientId serviceIds isActive' },
  { path: 'clientId', select: 'organizationName email' },
  { path: 'serviceId', select: 'name estimatedHours compliancePeriodType turnaroundBusinessDays' },
  { path: 'assigneeId', select: 'name email role reportingManagerId' },
  { path: 'helpingMemberId', select: 'name email' },
  { path: 'managerId', select: 'name email' },
  { path: 'stageId', select: 'name color order systemKey' },
  { path: 'createdBy', select: 'name email' },
];

/** List grid: no history / review / description payloads */
const LIST_POPULATE = LIFECYCLE_POPULATE;
const LIST_SELECT =
  '-description -descriptionMentions -descriptionHistory -reviewPoints -reviewPointsHistory';

const stageByKeyCache = new Map(); // `${orgId}:${systemKey}` -> { expiresAt, stage }

async function getStageBySystemKeyCached(orgId, systemKey) {
  const key = `${orgId}:${systemKey}`;
  const cached = stageByKeyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.stage;

  const stage = await findStageBySystemKey(orgId, systemKey);
  if (stage) {
    stageByKeyCache.set(key, { stage, expiresAt: Date.now() + 5 * 60 * 1000 });
  }
  return stage;
}

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
    if (staffId) {
      filter.$or = [{ assigneeId: staffId }, { helpingMemberId: staffId }];
    }
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
      const searchOr = [
        { title: { $regex: search, $options: 'i' } },
        { taskCode: { $regex: search, $options: 'i' } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    const tasks = await Task.find(filter)
      .select(LIST_SELECT)
      .populate(LIST_POPULATE)
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

    res.json({ data: await maskActors(result) });
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
      .limit(100)
      .lean();

    res.json({ data: await maskActors({ ...task, timeLogs: logs }) });
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
      projectId,
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
    } = req.body;

    const [project, client, service, assignee, stage] = await Promise.all([
      ProjectMaster.findOne({ _id: projectId, organizationId: orgId, isActive: true }),
      ClientMaster.findOne({ _id: clientId, organizationId: orgId, isActive: true }),
      ServiceMaster.findOne({ _id: serviceId, organizationId: orgId, isActive: true }),
      User.findOne({ _id: assigneeId, organizationId: orgId, isActive: true }),
      StageMaster.findOne({ _id: stageId, organizationId: orgId, isActive: true }),
    ]);

    if (!project) return res.status(400).json({ message: 'Invalid project' });
    if (!client) return res.status(400).json({ message: 'Invalid client' });
    if (!service) return res.status(400).json({ message: 'Invalid service' });
    if (!assignee) return res.status(400).json({ message: 'Invalid assignee' });
    if (!stage) return res.status(400).json({ message: 'Invalid stage' });

    if (String(project.clientId) !== String(clientId)) {
      return res.status(400).json({ message: 'Client does not match the selected project' });
    }

    const projectServiceIds = (project.serviceIds || []).map((id) => String(id));
    if (!projectServiceIds.includes(String(serviceId))) {
      return res.status(400).json({
        message: 'Selected service is not part of this project',
      });
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
        message: 'Could not generate task title - check client, service, and compliance period',
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
    const computedTarget = computeTargetDate({
      receiveDate,
      turnaroundBusinessDays: service.turnaroundBusinessDays,
      querySentDate: parsedQuerySent,
      replyReceivedDate: parsedReplyReceived,
    });
    let finalTarget = computedTarget;
    if (targetDate != null && canEditTargetDate(req)) {
      finalTarget = new Date(targetDate);
    }

    const taskCode = await generateTaskCode(orgId);
    const mentionUsers = await loadMentionUsers(User, orgId);
    const incomingPoints = Array.isArray(reviewPoints) ? reviewPoints : [];

    const initialDescription = String(description || '').trim();
    if (initialDescription && req.canSaveTaskDescription !== true) {
      return res.status(403).json({
        message: 'You do not have permission to save task description',
      });
    }

    const task = await Task.create({
      organizationId: orgId,
      taskCode,
      title,
      description: initialDescription,
      descriptionMentions: extractMentions(initialDescription, mentionUsers),
      descriptionHistory: initialDescription
        ? [
            {
              action: 'added',
              changedAt: new Date(),
              changedBy: req.user._id,
              description: initialDescription,
              previousDescription: '',
            },
          ]
        : [],
      reviewPoints: withReviewPointMentions(incomingPoints, mentionUsers),
      projectId: project._id,
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

    const actorName = visibleActorName(req.user, orgId);
    await notifyNewTaskMentions({
      organizationId: orgId,
      actorId: req.user._id,
      actorName,
      task,
      previousMentions: new Set(),
    });
    await notifyTaskAssignment({
      organizationId: orgId,
      actorId: req.user._id,
      actorName,
      task,
    });
    publishOrgEvent(
      orgId,
      { type: 'task.changed', reason: 'create', taskId: task._id, actorId: req.user._id },
      { excludeUserId: req.user._id }
    );

    const populated = await Task.findById(task._id).populate(POPULATE).lean();
    res.status(201).json({ data: await maskActors(populated), message: 'Task created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const previousAssigneeId = task.assigneeId;
    const previousHelpingMemberId = task.helpingMemberId;

    const {
      description,
      reviewPoints,
      projectId,
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

    // Fast path: description-only save (Task Description Save button)
    const descriptionOnly =
      description != null &&
      reviewPoints === undefined &&
      projectId === undefined &&
      clientId === undefined &&
      serviceId === undefined &&
      assigneeId === undefined &&
      helpingMemberId === undefined &&
      stageId === undefined &&
      priority === undefined &&
      compliancePeriodInput === undefined &&
      taskReceiveDate === undefined &&
      querySentDate === undefined &&
      replyReceivedDate === undefined &&
      targetDate === undefined &&
      dueDate === undefined &&
      budgetHours === undefined;

    if (descriptionOnly) {
      const nextDescription = String(description || '').trim();
      const previousDescription = String(task.description || '').trim();
      if (nextDescription !== previousDescription) {
        const hadDescription = Boolean(previousDescription);
        if (!hadDescription && req.canSaveTaskDescription !== true) {
          return res.status(403).json({
            message: 'You do not have permission to save task description',
          });
        }
        if (hadDescription && req.canEditTaskDescription !== true) {
          return res.status(403).json({
            message: 'You do not have permission to edit task description',
          });
        }
        if (hadDescription && req.canSaveTaskDescription !== true) {
          return res.status(403).json({
            message: 'You do not have permission to save task description',
          });
        }
        task.descriptionHistory.push({
          action: hadDescription ? 'updated' : 'added',
          changedAt: new Date(),
          changedBy: req.user._id,
          description: nextDescription,
          previousDescription,
        });
      }

      const previousMentions = collectTaskMentionIds(task);
      const needsMentionUsers = nextDescription.includes('@');
      const mentionUsers = needsMentionUsers
        ? await loadMentionUsers(User, orgId)
        : [];
      task.description = nextDescription;
      task.descriptionMentions = extractMentions(nextDescription, mentionUsers);
      await task.save();

      // Mentions notify in background — don't block the save response
      if (needsMentionUsers) {
        void notifyNewTaskMentions({
          organizationId: orgId,
          actorId: req.user._id,
          actorName: visibleActorName(req.user, orgId),
          task,
          previousMentions,
        }).catch((err) => console.error('[notifyNewTaskMentions]', err.message));
      }

      const populated = await Task.findById(task._id)
        .populate([
          ...LIFECYCLE_POPULATE,
          { path: 'descriptionHistory.changedBy', select: 'name email' },
        ])
        .lean();
      return res.json({
        data: await maskActors(populated),
        message: 'Task description saved',
      });
    }

    // taskCode and title are never accepted from the client - title is regenerated below
    const previousMentions = collectTaskMentionIds(task);
    const mentionUsers =
      description != null || reviewPoints != null
        ? await loadMentionUsers(User, orgId)
        : [];
    if (description != null) {
      const nextDescription = String(description || '').trim();
      const previousDescription = String(task.description || '').trim();
      if (nextDescription !== previousDescription) {
        const hadDescription = Boolean(previousDescription);
        if (!hadDescription && req.canSaveTaskDescription !== true) {
          return res.status(403).json({
            message: 'You do not have permission to save task description',
          });
        }
        if (hadDescription && req.canEditTaskDescription !== true) {
          return res.status(403).json({
            message: 'You do not have permission to edit task description',
          });
        }
        // Saving after edit also requires save permission
        if (hadDescription && req.canSaveTaskDescription !== true) {
          return res.status(403).json({
            message: 'You do not have permission to save task description',
          });
        }
        task.descriptionHistory.push({
          action: hadDescription ? 'updated' : 'added',
          changedAt: new Date(),
          changedBy: req.user._id,
          description: nextDescription,
          previousDescription,
        });
      }
      task.description = nextDescription;
      task.descriptionMentions = extractMentions(nextDescription, mentionUsers);
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
        const { replies: _clientReplies, ...rest } = point;
        return {
          ...rest,
          status: existing?.status || point.status || 'pending',
          notes: existing?.notes ?? point.notes ?? '',
          // Replies are managed via the dedicated reply endpoint — never wipe on save
          replies: existing?.replies || [],
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

    if (projectId) {
      const project = await ProjectMaster.findOne({
        _id: projectId,
        organizationId: orgId,
      });
      if (!project) return res.status(400).json({ message: 'Invalid project' });
      task.projectId = projectId;
      if (!clientId) task.clientId = project.clientId;
    }

    if (clientId) {
      const client = await ClientMaster.findOne({ _id: clientId, organizationId: orgId });
      if (!client) return res.status(400).json({ message: 'Invalid client' });
      task.clientId = clientId;
    }

    if (serviceId) {
      const service = await ServiceMaster.findOne({ _id: serviceId, organizationId: orgId });
      if (!service) return res.status(400).json({ message: 'Invalid service' });
      if (task.projectId) {
        const project = await ProjectMaster.findById(task.projectId).lean();
        const projectServiceIds = (project?.serviceIds || []).map((id) => String(id));
        if (!projectServiceIds.includes(String(serviceId))) {
          return res.status(400).json({
            message: 'Selected service is not part of this project',
          });
        }
      }
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
    const holdDatesChanged =
      querySentDate !== undefined || replyReceivedDate !== undefined;
    const shouldRecomputeTarget = receiveOrServiceChanged || holdDatesChanged;

    if (targetDate != null && canEditTargetDate(req)) {
      task.targetDate = new Date(targetDate);
    } else if (shouldRecomputeTarget && service && task.taskReceiveDate) {
      task.targetDate = computeTargetDate({
        receiveDate: task.taskReceiveDate,
        turnaroundBusinessDays: service.turnaroundBusinessDays,
        querySentDate: task.querySentDate,
        replyReceivedDate: task.replyReceivedDate,
      });
    }

    if (dueDate == null && task.targetDate) {
      task.dueDate = task.targetDate;
    }

    const titleFieldsChanged =
      projectId != null ||
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

    const actorName = visibleActorName(req.user, orgId);
    if (description != null || reviewPoints != null) {
      await notifyNewTaskMentions({
        organizationId: orgId,
        actorId: req.user._id,
        actorName,
        task,
        previousMentions,
      });
    }

    if (assigneeId || helpingMemberId !== undefined) {
      await notifyTaskAssignment({
        organizationId: orgId,
        actorId: req.user._id,
        actorName,
        task,
        previousAssigneeId,
        previousHelpingMemberId,
      });
    }

    publishOrgEvent(
      orgId,
      {
        type: 'task.changed',
        reason: description != null && Object.keys(req.body).length <= 2 ? 'description' : 'update',
        taskId: task._id,
        actorId: req.user._id,
      },
      { excludeUserId: req.user._id }
    );

    const populated = await Task.findById(task._id).populate(POPULATE).lean();
    res.json({ data: await maskActors(populated), message: 'Task updated' });
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

    const [pending, task, open] = await Promise.all([
      getPendingNoteSession(userId),
      Task.findOne({ _id: req.params.id, organizationId: orgId }).select(
        '_id title taskCode completedAt ignoredAt'
      ),
      getOpenSession(userId),
    ]);
    if (pending) {
      return res.status(409).json({
        message: 'Please add a closing note for your previous session first',
        data: { pendingNote: pending },
      });
    }

    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (isTaskClosed(task)) {
      return res.status(400).json({
        message: 'Cannot start timer on a completed or ignored task',
      });
    }
    if (open) {
      const openTaskId = open.taskId?._id || open.taskId;
      if (open.type === 'task' && String(openTaskId) === String(task._id)) {
        return res.status(400).json({ message: 'Timer already running for this task' });
      }
      return res.status(409).json({
        message: 'Add a closing note for your current session before starting a new timer',
        data: { activeSession: open },
      });
    }

    const log = await TimeLog.create({
      organizationId: orgId,
      userId,
      type: 'task',
      taskId: task._id,
      startedAt: new Date(),
    });

    const populated = {
      ...log.toObject(),
      taskId: { _id: task._id, title: task.title, taskCode: task.taskCode },
    };
    res.status(201).json({ data: populated, message: 'Timer started' });
  } catch (err) {
    next(err);
  }
}

async function stopTimer(req, res, next) {
  try {
    const userId = req.user._id;
    const orgId = orgFilter(req.user).organizationId;
    const { closingNote, closingNoteStageId } = req.body;

    if (!closingNote || String(closingNote).trim().length < 10) {
      return res.status(400).json({ message: 'Closing note must be at least 10 characters' });
    }

    const [closingStage, open] = await Promise.all([
      StageMaster.findOne({
        _id: closingNoteStageId,
        organizationId: orgId,
        stageType: 'closing_note',
        isActive: true,
      })
        .select('_id')
        .lean(),
      TimeLog.findOne({
        userId,
        type: 'task',
        taskId: req.params.id,
        stoppedAt: null,
      }),
    ]);
    if (!closingStage) {
      return res.status(400).json({ message: 'Invalid closing note stage' });
    }

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
        const task = await Task.findById(req.params.id)
          .select('_id totalLoggedMinutes title taskCode')
          .lean();
        return res.json({
          data: { timeLog: completed, task },
          message: 'Timer stopped',
        });
      }
      return res.status(404).json({ message: 'No running timer for this task' });
    }

    const stoppedAt = new Date();
    const minutes = computeDurationMinutes(open.startedAt, stoppedAt);
    open.stoppedAt = stoppedAt;
    open.systemDurationMinutes = minutes;
    open.closingNote = closingNote.trim();
    open.closingNoteStageId = closingStage._id;
    open.pendingClosingNote = false;
    await open.save();

    const task = await incrementTaskLoggedMinutes(open.taskId, minutes);

    res.json({
      data: { timeLog: open.toObject(), task },
      message: 'Timer stopped',
    });
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

    const completedStage = await getStageBySystemKeyCached(orgId, 'completed');
    if (!completedStage) {
      return res.status(400).json({
        message: 'Completed stage is missing - check Stage Master',
      });
    }

    task.completedAt = completionDate;
    task.ignoredAt = null;
    task.ignoreRemarks = '';
    task.stageId = completedStage._id;
    await task.save();

    const populated = await Task.findById(task._id).populate(LIFECYCLE_POPULATE).lean();
    res.json({ data: await maskActors(populated), message: 'Task completed' });
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

    const ignoredStage = await getStageBySystemKeyCached(orgId, 'ignored');
    if (!ignoredStage) {
      return res.status(400).json({
        message: 'Ignored stage is missing - check Stage Master',
      });
    }

    task.ignoredAt = ignoreDate;
    task.ignoreRemarks = remarks;
    task.completedAt = null;
    task.stageId = ignoredStage._id;
    await task.save();

    const populated = await Task.findById(task._id).populate(LIFECYCLE_POPULATE).lean();
    res.json({ data: await maskActors(populated), message: 'Task ignored' });
  } catch (err) {
    next(err);
  }
}

async function populateTaskLite(taskId) {
  return Task.findById(taskId)
    .populate([
      ...LIFECYCLE_POPULATE,
      { path: 'reviewPointsHistory.changedBy', select: 'name email' },
    ])
    .lean();
}

function canManageReviewMessage(req, authorId) {
  if (req.user.role === 'super_admin' || req.user.role === 'owner' || req.user.role === 'manager') {
    return true;
  }
  return String(authorId) === String(req.user._id);
}

async function replyReviewPoint(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const message = String(req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ message: 'Reply message is required' });
    }
    if (message.length < 2) {
      return res.status(400).json({ message: 'Reply must be at least 2 characters' });
    }

    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const point = task.reviewPoints.id(req.params.pointId);
    if (!point) return res.status(404).json({ message: 'Review point not found' });

    let replyToId = null;
    let replyToPreview = String(req.body.replyToPreview || '').trim().slice(0, 240);
    let replyToAuthorName = String(req.body.replyToAuthorName || '').trim().slice(0, 120);

    const rawReplyToId = req.body.replyToId;
    if (rawReplyToId && mongoose.Types.ObjectId.isValid(String(rawReplyToId))) {
      const quoted = (point.replies || []).find(
        (r) => String(r._id) === String(rawReplyToId)
      );
      if (!quoted) {
        return res.status(400).json({ message: 'Quoted reply not found' });
      }
      if (quoted.deletedAt) {
        return res.status(400).json({ message: 'Cannot reply to a deleted message' });
      }
      replyToId = quoted._id;
      if (!replyToPreview) replyToPreview = String(quoted.message || '').trim().slice(0, 240);
      if (!replyToAuthorName) replyToAuthorName = quoted.authorName || 'User';
    } else if (replyToPreview && !replyToAuthorName) {
      replyToAuthorName = 'Review point';
    }

    const authorName = visibleActorName(req.user, orgId);
    point.replies.push({
      authorId: req.user._id,
      authorName,
      message,
      replyToId,
      replyToPreview,
      replyToAuthorName,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(),
    });

    await task.save();

    const savedReply = point.replies[point.replies.length - 1];

    const replyObj = savedReply.toObject();

    // Notify in background — do not block the chat send response
    notifyReviewPointReply({
      organizationId: orgId,
      actorId: req.user._id,
      actorName: authorName,
      task,
      point,
      replyMessage: message,
    }).catch((err) => {
      console.error('[SimplyTrack] notifyReviewPointReply failed:', err.message);
    });

    // Live push so other open sessions see the message without refresh
    publishOrgEvent(
      orgId,
      {
        type: 'task.message',
        reason: 'reply',
        taskId: task._id,
        pointId: point._id,
        reply: replyObj,
        actorId: req.user._id,
      },
      { excludeUserId: req.user._id }
    );

    // Fast response: only the new reply (UI merges into existing task)
    res.status(201).json({
      data: {
        taskId: task._id,
        pointId: point._id,
        reply: replyObj,
      },
      message: 'Reply added',
    });
  } catch (err) {
    next(err);
  }
}

async function editReviewPointReply(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const message = String(req.body.message || '').trim();
    if (message.length < 2) {
      return res.status(400).json({ message: 'Reply must be at least 2 characters' });
    }

    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const point = task.reviewPoints.id(req.params.pointId);
    if (!point) return res.status(404).json({ message: 'Review point not found' });

    const reply = point.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });
    if (reply.deletedAt) {
      return res.status(400).json({ message: 'Cannot edit a deleted message' });
    }
    if (!canManageReviewMessage(req, reply.authorId)) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }

    reply.message = message;
    reply.editedAt = new Date();
    await task.save();

    const replyObj = reply.toObject();
    publishOrgEvent(
      orgId,
      {
        type: 'task.message',
        reason: 'edit',
        taskId: task._id,
        pointId: point._id,
        reply: replyObj,
        actorId: req.user._id,
      },
      { excludeUserId: req.user._id }
    );

    res.json({
      data: {
        taskId: task._id,
        pointId: point._id,
        reply: replyObj,
      },
      message: 'Message updated',
    });
  } catch (err) {
    next(err);
  }
}

async function softDeleteReviewPointReply(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const point = task.reviewPoints.id(req.params.pointId);
    if (!point) return res.status(404).json({ message: 'Review point not found' });

    const reply = point.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });
    if (reply.deletedAt) {
      return res.status(400).json({ message: 'Message already deleted' });
    }
    if (!canManageReviewMessage(req, reply.authorId)) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }

    // Soft delete — message text stays in DB
    reply.deletedAt = new Date();
    await task.save();

    const replyObj = reply.toObject();
    publishOrgEvent(
      orgId,
      {
        type: 'task.message',
        reason: 'delete',
        taskId: task._id,
        pointId: point._id,
        reply: replyObj,
        actorId: req.user._id,
      },
      { excludeUserId: req.user._id }
    );

    res.json({
      data: {
        taskId: task._id,
        pointId: point._id,
        reply: replyObj,
      },
      message: 'Message deleted',
    });
  } catch (err) {
    next(err);
  }
}

async function updateReviewPointRoot(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const task = await Task.findOne({ _id: req.params.id, organizationId: orgId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const point = task.reviewPoints.id(req.params.pointId);
    if (!point) return res.status(404).json({ message: 'Review point not found' });

    if (req.body.softDelete === true) {
      if (point.descriptionDeletedAt) {
        return res.status(400).json({ message: 'Message already deleted' });
      }
      point.descriptionDeletedAt = new Date();
      await task.save();
      const populated = await populateTaskLite(task._id);
      return res.json({ data: await maskActors(populated), message: 'Message deleted' });
    }

    if (point.descriptionDeletedAt) {
      return res.status(400).json({ message: 'Cannot edit a deleted message' });
    }

    const nextDescription = String(req.body.description || '').trim();
    if (!nextDescription) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const previous = String(point.description || '').trim();
    if (nextDescription !== previous) {
      point.description = nextDescription;
      point.descriptionEditedAt = new Date();
      const mentionUsers = nextDescription.includes('@')
        ? await loadMentionUsers(User, orgId)
        : [];
      point.mentions = extractMentions(nextDescription, mentionUsers);
    }

    await task.save();
    const populated = await populateTaskLite(task._id);
    res.json({ data: await maskActors(populated), message: 'Message updated' });
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
    res.status(201).json({ data: await maskActors(populated), message: 'Converted to task' });
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
  replyReviewPoint,
  editReviewPointReply,
  softDeleteReviewPointReply,
  updateReviewPointRoot,
  checkRecurring,
  listSuggestions,
  acceptSuggestion: acceptSuggestionHandler,
  dismissSuggestion: dismissSuggestionHandler,
};
