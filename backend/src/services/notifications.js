const Notification = require('../models/Notification');
const User = require('../models/User');
const { publishToUsers, publishOrgEvent } = require('./realtime');

function publishNotificationDocs(docs, extra = {}) {
  const list = Array.isArray(docs) ? docs : docs ? [docs] : [];
  if (!list.length) return list;

  for (const doc of list) {
    const recipientId = doc.recipientId?._id || doc.recipientId;
    if (!recipientId) continue;
    publishToUsers(
      doc.organizationId,
      [recipientId],
      {
        type: 'notification',
        notificationType: doc.type,
        taskId: doc.taskId || null,
        reviewPointId: doc.reviewPointId || null,
        shareRequestId: doc.shareRequestId || null,
        timeAdjustmentRequestId: doc.timeAdjustmentRequestId || null,
        message: doc.message || '',
        notificationId: doc._id || null,
        ...extra,
      },
      { excludeUserId: doc.actorId }
    );
  }
  return list;
}

async function insertAndPublish(docs, extra = {}) {
  if (!docs?.length) return [];
  const created = await Notification.insertMany(docs);
  publishNotificationDocs(created, extra);
  return created;
}

function mentionUserIds(mentions = []) {
  return (mentions || [])
    .map((m) => String(m.userId || m._id || ''))
    .filter(Boolean);
}

function collectTaskMentionIds(task) {
  const ids = new Set(mentionUserIds(task?.descriptionMentions));
  for (const point of task?.reviewPoints || []) {
    for (const id of mentionUserIds(point.mentions)) {
      ids.add(id);
    }
  }
  return ids;
}

function taskLabel(task) {
  const code = task?.taskCode ? String(task.taskCode).trim() : '';
  const title = task?.title ? String(task.title).trim() : '';
  if (code && title) return `${code} — ${title}`;
  return code || title || 'a task';
}

function firstReviewPointIdForUser(task, userId) {
  for (const point of task?.reviewPoints || []) {
    if (!point?._id) continue;
    if (mentionUserIds(point.mentions).includes(String(userId))) {
      return point._id;
    }
  }
  return null;
}

/**
 * Create notifications for newly mentioned users on a task.
 * Compares previous vs next mention sets so re-saves do not spam.
 */
async function notifyNewTaskMentions({
  organizationId,
  actorId,
  actorName,
  task,
  previousMentions = new Set(),
}) {
  if (!task || !organizationId || !actorId) return [];

  const nextMentions = collectTaskMentionIds(task);
  const actor = String(actorId);
  const newlyTagged = [...nextMentions].filter(
    (id) => id !== actor && !previousMentions.has(id)
  );
  if (!newlyTagged.length) return [];

  const label = taskLabel(task);
  const who = actorName || 'Someone';
  const descriptionIds = new Set(mentionUserIds(task.descriptionMentions));

  const docs = newlyTagged.map((recipientId) => {
    const reviewPointId = firstReviewPointIdForUser(task, recipientId);
    const inDescriptionOnly = descriptionIds.has(recipientId) && !reviewPointId;

    return {
      organizationId,
      recipientId,
      actorId,
      type: inDescriptionOnly ? 'mention_description' : 'mention_review_point',
      taskId: task._id,
      reviewPointId: inDescriptionOnly ? null : reviewPointId,
      message: inDescriptionOnly
        ? `${who} mentioned you in ${label}`
        : `${who} mentioned you in a review point on ${label}`,
      isRead: false,
    };
  });

  return insertAndPublish(docs, { reason: 'mention' });
}

/**
 * Notify conversation participants + manager when someone replies on a review point.
 * Includes tagged users, prior reply authors, task stakeholders, and anyone who
 * previously mentioned / was notified on this review point (so the original
 * mentioner always gets reply alerts even when they are not manager/assignee).
 */
async function notifyReviewPointReply({
  organizationId,
  actorId,
  actorName,
  task,
  point,
  replyMessage,
}) {
  if (!task || !point || !organizationId || !actorId) return [];

  const recipients = new Set();
  for (const id of mentionUserIds(point.mentions)) {
    recipients.add(id);
  }
  for (const reply of point.replies || []) {
    if (reply?.authorId) recipients.add(String(reply.authorId));
  }
  if (task.managerId) recipients.add(String(task.managerId));
  if (task.assigneeId) recipients.add(String(task.assigneeId));
  if (task.helpingMemberId) recipients.add(String(task.helpingMemberId));
  if (task.createdBy) recipients.add(String(task.createdBy));

  const pointId = point._id ? String(point._id) : null;
  if (pointId) {
    for (const entry of task.reviewPointsHistory || []) {
      const entryPointId = entry?.pointId?._id || entry?.pointId;
      const changedBy = entry?.changedBy?._id || entry?.changedBy;
      if (!changedBy) continue;
      if (String(entryPointId || '') === pointId) {
        recipients.add(String(changedBy));
      }
    }
  }

  recipients.delete(String(actorId));
  if (!recipients.size) return [];

  const label = taskLabel(task);
  const who = actorName || 'Someone';
  const preview = String(replyMessage || '').trim().slice(0, 100);
  const suffix = preview ? `: “${preview}${preview.length >= 100 ? '…' : ''}”` : '';

  const docs = [...recipients].map((recipientId) => ({
    organizationId,
    recipientId,
    actorId,
    type: 'review_point_reply',
    taskId: task._id,
    reviewPointId: point._id,
    message: `${who} replied on a review point in ${label}${suffix}`,
    isRead: false,
  }));

  return insertAndPublish(docs, { reason: 'review_reply' });
}

function roundHours(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Notify manager that a staff member requested to share remaining task hours.
 */
async function notifyHourShareRequested({
  organizationId,
  actorId,
  actorName,
  task,
  shareRequest,
  toUserName,
}) {
  if (!task || !shareRequest || !organizationId || !actorId) return [];

  const managerId = task.managerId ? String(task.managerId) : null;
  if (!managerId || managerId === String(actorId)) return [];

  const label = taskLabel(task);
  const who = actorName || 'Someone';
  const keep = roundHours(shareRequest.keepHours);
  const transfer = roundHours(shareRequest.transferHours);
  const helper = toUserName || 'another member';
  const comment = String(shareRequest.requesterComment || '').trim().slice(0, 120);
  const suffix = comment ? ` — “${comment}${comment.length >= 120 ? '…' : ''}”` : '';

  const doc = {
    organizationId,
    recipientId: managerId,
    actorId,
    type: 'hour_share_requested',
    taskId: task._id,
    shareRequestId: shareRequest._id,
    message: `${who} requested to share ${label}: keep ${keep}h, give ${transfer}h to ${helper}${suffix}`,
    isRead: false,
  };

  return insertAndPublish([doc], { reason: 'hour_share_requested' });
}

/**
 * Notify requester (and shared member on approve) about the manager decision.
 */
async function notifyHourShareDecision({
  organizationId,
  actorId,
  actorName,
  task,
  shareRequest,
  decision,
  toUserId,
}) {
  if (!task || !shareRequest || !organizationId || !actorId) return [];
  if (decision !== 'approved' && decision !== 'rejected') return [];

  const label = taskLabel(task);
  const who = actorName || 'Manager';
  const comment = String(shareRequest.managerComment || '').trim().slice(0, 120);
  const suffix = comment ? ` — “${comment}${comment.length >= 120 ? '…' : ''}”` : '';
  const type = decision === 'approved' ? 'hour_share_approved' : 'hour_share_rejected';

  const recipients = new Set();
  if (shareRequest.requestedById) recipients.add(String(shareRequest.requestedById));
  if (decision === 'approved' && toUserId) recipients.add(String(toUserId));
  recipients.delete(String(actorId));
  if (!recipients.size) return [];

  const docs = [...recipients].map((recipientId) => {
    const isHelper = toUserId && String(recipientId) === String(toUserId);
    let message;
    if (decision === 'approved' && isHelper) {
      message = `${who} shared ${label} with you (${roundHours(shareRequest.transferHours)}h)${suffix}`;
    } else if (decision === 'approved') {
      message = `${who} approved your hour-share request for ${label}${suffix}`;
    } else {
      message = `${who} rejected your hour-share request for ${label}${suffix}`;
    }

    return {
      organizationId,
      recipientId,
      actorId,
      type,
      taskId: task._id,
      shareRequestId: shareRequest._id,
      message,
      isRead: false,
    };
  });

  return insertAndPublish(docs, { reason: 'hour_share_decision' });
}

async function notifyTimeAdjustmentSubmitted({
  organizationId,
  actorId,
  actorName,
  request,
}) {
  if (!organizationId || !request) return [];

  const owners = await User.find({
    organizationId,
    role: 'owner',
    isActive: true,
  })
    .select('_id')
    .lean();

  const recipients = owners
    .map((o) => String(o._id))
    .filter((id) => id !== String(actorId));
  if (!recipients.length) return [];

  const who = actorName || 'Someone';
  const ticket = request.ticketNumber || 'adjustment';
  const desc = String(request.description || '').trim().slice(0, 100);
  const suffix = desc ? ` — “${desc}${desc.length >= 100 ? '…' : ''}”` : '';

  const docs = recipients.map((recipientId) => ({
    organizationId,
    recipientId,
    actorId,
    type: 'time_adjustment_submitted',
    timeAdjustmentRequestId: request._id,
    message: `${who} submitted time adjustment ${ticket}${suffix}`,
    isRead: false,
  }));

  return insertAndPublish(docs, { reason: 'time_adjustment_submitted' });
}

async function notifyTimeAdjustmentDecision({
  organizationId,
  actorId,
  actorName,
  request,
  decision,
}) {
  if (!organizationId || !request || !request.requestedById) return [];
  if (decision !== 'approved' && decision !== 'rejected') return [];

  const recipientId = String(request.requestedById);
  if (recipientId === String(actorId)) return [];

  const who = actorName || 'Owner';
  const ticket = request.ticketNumber || 'request';
  const comment = String(request.reviewerComment || '').trim().slice(0, 120);
  const suffix = comment ? ` — “${comment}${comment.length >= 120 ? '…' : ''}”` : '';
  const type = 'time_adjustment_decided';

  let message;
  if (decision === 'approved') {
    message = `${who} approved your time adjustment ${ticket}${suffix}`;
  } else {
    message = `${who} rejected your time adjustment ${ticket}${suffix}`;
  }

  return insertAndPublish(
    [
      {
        organizationId,
        recipientId,
        actorId,
        type,
        timeAdjustmentRequestId: request._id,
        message,
        isRead: false,
      },
    ],
    { reason: 'time_adjustment_decided' }
  );
}

/**
 * Notify newly assigned / helping members when a task is created or reassigned.
 */
async function notifyTaskAssignment({
  organizationId,
  actorId,
  actorName,
  task,
  previousAssigneeId = null,
  previousHelpingMemberId = null,
}) {
  if (!task || !organizationId || !actorId) return [];

  const actor = String(actorId);
  const nextAssignee = task.assigneeId ? String(task.assigneeId._id || task.assigneeId) : null;
  const nextHelper = task.helpingMemberId
    ? String(task.helpingMemberId._id || task.helpingMemberId)
    : null;
  const prevAssignee = previousAssigneeId ? String(previousAssigneeId) : null;
  const prevHelper = previousHelpingMemberId ? String(previousHelpingMemberId) : null;

  const recipients = new Set();
  if (nextAssignee && nextAssignee !== actor && nextAssignee !== prevAssignee) {
    recipients.add(nextAssignee);
  }
  if (nextHelper && nextHelper !== actor && nextHelper !== prevHelper) {
    recipients.add(nextHelper);
  }
  if (!recipients.size) return [];

  const label = taskLabel(task);
  const who = actorName || 'Someone';
  const docs = [...recipients].map((recipientId) => {
    const isAssignee = recipientId === nextAssignee;
    return {
      organizationId,
      recipientId,
      actorId,
      type: 'task_assigned',
      taskId: task._id,
      message: isAssignee
        ? `${who} assigned you to ${label}`
        : `${who} added you as helping member on ${label}`,
      isRead: false,
    };
  });

  const created = await insertAndPublish(docs, { reason: 'task_assigned' });
  publishOrgEvent(
    organizationId,
    {
      type: 'task.changed',
      reason: 'assign',
      taskId: task._id,
      actorId,
    },
    { excludeUserId: actorId, userIds: [...recipients] }
  );
  return created;
}

module.exports = {
  mentionUserIds,
  collectTaskMentionIds,
  notifyNewTaskMentions,
  notifyReviewPointReply,
  notifyHourShareRequested,
  notifyHourShareDecision,
  notifyTimeAdjustmentSubmitted,
  notifyTimeAdjustmentDecision,
  notifyTaskAssignment,
  publishNotificationDocs,
};
