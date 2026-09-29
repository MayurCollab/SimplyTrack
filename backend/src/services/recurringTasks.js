const Task = require('../models/Task');
const TaskRecurrence = require('../models/TaskRecurrence');
const TaskSuggestion = require('../models/TaskSuggestion');
const ClientMaster = require('../models/ClientMaster');
const ServiceMaster = require('../models/ServiceMaster');
const StageMaster = require('../models/StageMaster');
const User = require('../models/User');
const { orgFilter } = require('../utils/orgScope');
const { generateTaskCode } = require('./taskCode');
const { formatCompliancePeriodValue, buildTaskTitle } = require('./taskTitle');
const { computeTargetDate } = require('./targetDate');
const { findStageBySystemKey } = require('./stages');
const {
  advanceCompliancePeriodInput,
  dueDateFromComplianceInput,
  suggestAtFromComplianceInput,
} = require('./recurrence');

const SUGGESTION_POPULATE = [
  { path: 'clientId', select: 'organizationName' },
  { path: 'serviceId', select: 'name compliancePeriodType estimatedHours turnaroundBusinessDays' },
  { path: 'recurrenceId', select: 'frequency nextSuggestAt endDate' },
];

async function isFirstClientServiceTask(organizationId, clientId, serviceId) {
  const count = await Task.countDocuments({ organizationId, clientId, serviceId });
  return count === 0;
}

async function getActiveRecurrence(organizationId, clientId, serviceId) {
  return TaskRecurrence.findOne({
    organizationId,
    clientId,
    serviceId,
    isActive: true,
  }).lean();
}

async function createRecurrenceFromTask({
  organizationId,
  task,
  service,
  frequency,
  startDate,
  endDate,
  alertId,
}) {
  const nextInput = advanceCompliancePeriodInput(
    task.compliancePeriodInput,
    service.compliancePeriodType,
    frequency
  );
  const nextSuggestAt = suggestAtFromComplianceInput(nextInput, service.compliancePeriodType);

  return TaskRecurrence.create({
    organizationId,
    clientId: task.clientId,
    serviceId: task.serviceId,
    frequency,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    nextCompliancePeriodInput: nextInput,
    nextSuggestAt: nextSuggestAt || new Date(),
    template: {
      assigneeId: task.assigneeId,
      helpingMemberId: task.helpingMemberId || null,
      stageId: task.stageId,
      priority: task.priority || 'medium',
      budgetHours: task.budgetHours,
      description: task.description || '',
    },
    createdFromTaskId: task._id,
    alertId: alertId || task.alertId || null,
    isActive: true,
  });
}

async function advanceRecurrence(recurrence, service) {
  const nextInput = advanceCompliancePeriodInput(
    recurrence.nextCompliancePeriodInput,
    service.compliancePeriodType,
    recurrence.frequency
  );
  const nextSuggestAt = suggestAtFromComplianceInput(nextInput, service.compliancePeriodType);

  recurrence.nextCompliancePeriodInput = nextInput;
  recurrence.nextSuggestAt = nextSuggestAt || new Date();

  if (recurrence.endDate && recurrence.nextSuggestAt > recurrence.endDate) {
    recurrence.isActive = false;
  }

  await recurrence.save();
  return recurrence;
}

/**
 * Create pending suggestions for due recurrences (org-scoped or all).
 */
async function generateDueSuggestions(organizationId = null) {
  const filter = {
    isActive: true,
    nextSuggestAt: { $lte: new Date() },
  };
  if (organizationId) filter.organizationId = organizationId;

  const recurrences = await TaskRecurrence.find(filter);
  let created = 0;

  for (const recurrence of recurrences) {
    const existingPending = await TaskSuggestion.findOne({
      recurrenceId: recurrence._id,
      status: 'pending',
    });
    if (existingPending) continue;

    const service = await ServiceMaster.findById(recurrence.serviceId);
    if (!service) continue;

    if (recurrence.endDate && new Date() > recurrence.endDate) {
      recurrence.isActive = false;
      await recurrence.save();
      continue;
    }

    const input = recurrence.nextCompliancePeriodInput;
    const dueDate = dueDateFromComplianceInput(input, service.compliancePeriodType);
    if (!dueDate) continue;

    const periodValue = formatCompliancePeriodValue(input, service.compliancePeriodType);

    try {
      await TaskSuggestion.create({
        organizationId: recurrence.organizationId,
        recurrenceId: recurrence._id,
        clientId: recurrence.clientId,
        serviceId: recurrence.serviceId,
        compliancePeriodInput: input,
        compliancePeriodValue: periodValue,
        dueDate,
        status: 'pending',
        suggestedAt: new Date(),
      });
      created += 1;
    } catch (err) {
      // Duplicate key — already suggested this period
      if (err.code !== 11000) throw err;
    }
  }

  return created;
}

async function listPendingSuggestions(organizationId) {
  await generateDueSuggestions(organizationId);
  return TaskSuggestion.find({
    organizationId,
    status: 'pending',
  })
    .populate(SUGGESTION_POPULATE)
    .sort({ suggestedAt: 1 })
    .lean();
}

async function acceptSuggestion(suggestionId, organizationId, userId) {
  const suggestion = await TaskSuggestion.findOne({
    _id: suggestionId,
    organizationId,
    status: 'pending',
  });
  if (!suggestion) {
    const err = new Error('Suggestion not found or already resolved');
    err.status = 404;
    throw err;
  }

  const recurrence = await TaskRecurrence.findById(suggestion.recurrenceId);
  if (!recurrence || !recurrence.isActive) {
    const err = new Error('Recurrence is no longer active');
    err.status = 400;
    throw err;
  }

  const [client, service, assignee] = await Promise.all([
    ClientMaster.findById(suggestion.clientId),
    ServiceMaster.findById(suggestion.serviceId),
    User.findById(recurrence.template.assigneeId),
  ]);

  if (!client || !service) {
    const err = new Error('Client or service missing');
    err.status = 400;
    throw err;
  }

  let stageId = recurrence.template.stageId;
  const pendingStage = await findStageBySystemKey(organizationId, 'pending');
  if (pendingStage) stageId = pendingStage._id;

  const periodValue = formatCompliancePeriodValue(
    suggestion.compliancePeriodInput,
    service.compliancePeriodType
  );
  const title = buildTaskTitle(client.organizationName, service.name, periodValue);
  const receiveDate = new Date();
  receiveDate.setHours(0, 0, 0, 0);
  const targetDate = computeTargetDate(receiveDate, service.turnaroundBusinessDays);
  const taskCode = await generateTaskCode(organizationId);

  const task = await Task.create({
    organizationId,
    taskCode,
    title,
    description: recurrence.template.description || '',
    clientId: suggestion.clientId,
    serviceId: suggestion.serviceId,
    assigneeId: recurrence.template.assigneeId,
    helpingMemberId: recurrence.template.helpingMemberId || null,
    managerId: assignee?.reportingManagerId || null,
    stageId,
    priority: recurrence.template.priority || 'medium',
    compliancePeriodInput: suggestion.compliancePeriodInput,
    compliancePeriodValue: periodValue,
    taskReceiveDate: receiveDate,
    targetDate,
    dueDate: suggestion.dueDate,
    budgetHours: recurrence.template.budgetHours || service.estimatedHours,
    createdBy: userId,
    recurrenceId: recurrence._id,
  });

  suggestion.status = 'accepted';
  suggestion.resolvedAt = new Date();
  suggestion.createdTaskId = task._id;
  await suggestion.save();

  await advanceRecurrence(recurrence, service);

  return task;
}

async function dismissSuggestion(suggestionId, organizationId) {
  const suggestion = await TaskSuggestion.findOne({
    _id: suggestionId,
    organizationId,
    status: 'pending',
  });
  if (!suggestion) {
    const err = new Error('Suggestion not found or already resolved');
    err.status = 404;
    throw err;
  }

  const recurrence = await TaskRecurrence.findById(suggestion.recurrenceId);
  const service = recurrence
    ? await ServiceMaster.findById(recurrence.serviceId)
    : null;

  suggestion.status = 'dismissed';
  suggestion.resolvedAt = new Date();
  await suggestion.save();

  if (recurrence && service) {
    await advanceRecurrence(recurrence, service);
  }

  return suggestion;
}

async function checkRecurringEligibility(req) {
  const orgId = orgFilter(req.user).organizationId;
  const { clientId, serviceId } = req.query;
  if (!clientId || !serviceId) {
    return { isFirstTime: false, hasRecurrence: false };
  }

  const [firstTime, recurrence] = await Promise.all([
    isFirstClientServiceTask(orgId, clientId, serviceId),
    getActiveRecurrence(orgId, clientId, serviceId),
  ]);

  return {
    isFirstTime: firstTime,
    hasRecurrence: Boolean(recurrence),
    recurrence: recurrence
      ? {
          _id: recurrence._id,
          frequency: recurrence.frequency,
          nextSuggestAt: recurrence.nextSuggestAt,
          nextCompliancePeriodInput: recurrence.nextCompliancePeriodInput,
        }
      : null,
  };
}

module.exports = {
  isFirstClientServiceTask,
  getActiveRecurrence,
  createRecurrenceFromTask,
  generateDueSuggestions,
  listPendingSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  checkRecurringEligibility,
};
