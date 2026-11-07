const moment = require('moment-timezone');
const TimeLog = require('../models/TimeLog');
const Settings = require('../models/Settings');
const { orgFilter, getOrgId } = require('../utils/orgScope');
const {
  fetchTeamMembers,
  groupMembersByManager,
  canViewTeamMember,
} = require('../services/teamScope');
const { adminForceStopOpenSession } = require('../services/timer');
const { computeDurationMinutes } = require('../services/timeCalc');
const { visibleActorName } = require('../services/platformAccess');
const Notification = require('../models/Notification');

const DEFAULT_TZ = 'Asia/Kolkata';

const SESSION_POPULATE = [
  { path: 'taskId', select: 'title taskCode' },
  { path: 'closingNoteStageId', select: 'name stageType' },
];

function startOfDayInTz(timezone, date = new Date()) {
  return moment.tz(date, timezone).startOf('day').toDate();
}

function deriveStatus(active, pendingNote) {
  if (active?.stoppedAt == null && active) {
    if (active.type === 'task') return 'on_task';
    if (active.type === 'break') return 'on_break';
    if (active.type === 'training') return 'on_training';
  }
  if (pendingNote) return 'pending_note';
  return 'idle';
}

function sessionPayload(log, now = Date.now()) {
  if (!log) return null;
  const elapsedMinutes = log.stoppedAt
    ? log.systemDurationMinutes
    : computeDurationMinutes(log.startedAt, new Date(now));
  return {
    timeLogId: log._id,
    type: log.type,
    startedAt: log.startedAt,
    stoppedAt: log.stoppedAt || null,
    elapsedMinutes,
    task: log.taskId
      ? {
          taskId: log.taskId._id || log.taskId,
          taskCode: log.taskId.taskCode,
          title: log.taskId.title,
        }
      : null,
  };
}

async function buildTodayTotals(userIds, startOfDay) {
  const ids = userIds.map(String);
  if (!ids.length) return new Map();

  const rows = await TimeLog.aggregate([
    {
      $match: {
        userId: { $in: userIds },
        startedAt: { $gte: startOfDay },
        stoppedAt: { $ne: null },
        pendingClosingNote: { $ne: true },
      },
    },
    {
      $group: {
        _id: { userId: '$userId', type: '$type' },
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

  const map = new Map();
  for (const id of ids) {
    map.set(id, { taskMinutes: 0, breakMinutes: 0, trainingMinutes: 0 });
  }
  for (const row of rows) {
    const uid = String(row._id.userId);
    const bucket = map.get(uid) || { taskMinutes: 0, breakMinutes: 0, trainingMinutes: 0 };
    if (row._id.type === 'task') bucket.taskMinutes += row.total;
    else if (row._id.type === 'break') bucket.breakMinutes += row.total;
    else if (row._id.type === 'training') bucket.trainingMinutes += row.total;
    map.set(uid, bucket);
  }
  return map;
}

async function list(req, res, next) {
  try {
    const orgId = getOrgId(req.user);
    if (!orgId) {
      return res.status(403).json({ message: 'No organization context' });
    }

    const settings = await Settings.findOne({ organizationId: orgId })
      .select('dailyBreakHours defaultTimezone')
      .lean();
    const timezone = settings?.defaultTimezone || DEFAULT_TZ;
    const dailyBreakHours = settings?.dailyBreakHours ?? 1;
    const dailyBreakMinutes = dailyBreakHours * 60;
    const startOfDay = startOfDayInTz(timezone);

    const members = await fetchTeamMembers(orgId, req.user);
    const userIds = members.map((m) => m._id);

    const [todayMap, openLogs, pendingLogs] = await Promise.all([
      buildTodayTotals(userIds, startOfDay),
      TimeLog.find({ userId: { $in: userIds }, stoppedAt: null })
        .populate(SESSION_POPULATE)
        .lean(),
      TimeLog.find({
        userId: { $in: userIds },
        pendingClosingNote: true,
        stoppedAt: { $ne: null },
      })
        .populate(SESSION_POPULATE)
        .lean(),
    ]);

    const openByUser = new Map(openLogs.map((l) => [String(l.userId), l]));
    const pendingByUser = new Map(pendingLogs.map((l) => [String(l.userId), l]));

    const enriched = members.map((member) => {
      const uid = String(member._id);
      const active = openByUser.get(uid) || null;
      const pendingNote = pendingByUser.get(uid) || null;
      const today = todayMap.get(uid) || {
        taskMinutes: 0,
        breakMinutes: 0,
        trainingMinutes: 0,
      };

      if (active?.stoppedAt == null && active) {
        const live = computeDurationMinutes(active.startedAt);
        if (active.type === 'task') today.taskMinutes += live;
        else if (active.type === 'break') today.breakMinutes += live;
        else if (active.type === 'training') today.trainingMinutes += live;
      }

      return {
        userId: member._id,
        name: member.name,
        email: member.email,
        role: member.role,
        lastLoginAt: member.lastLoginAt,
        lastLoginIp: member.lastLoginIp || '',
        status: deriveStatus(active, pendingNote),
        activeSession: sessionPayload(active),
        pendingNote: pendingNote ? sessionPayload(pendingNote) : null,
        today: {
          ...today,
          breakOverAllowance: today.breakMinutes > dailyBreakMinutes,
        },
      };
    });

    const enrichedById = new Map(enriched.map((e) => [String(e.userId), e]));
    const role = req.user.role;
    const groups =
      role === 'owner' || role === 'super_admin'
        ? groupMembersByManager(members).map((g) => ({
            managerId: g.managerId,
            managerName: g.managerName,
            members: g.members
              .map((m) => enrichedById.get(String(m._id)))
              .filter(Boolean),
          }))
        : [
            {
              managerId: String(req.user._id),
              managerName: req.user.name,
              members: enriched,
            },
          ];

    res.json({
      data: {
        asOf: new Date().toISOString(),
        timezone,
        dailyBreakMinutes,
        groups,
        members: enriched,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function stopMemberTimer(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const targetUserId = req.params.userId;
    const { reason } = req.body;

    const allowed = await canViewTeamMember(req.user, orgId, targetUserId);
    if (!allowed) {
      return res.status(403).json({ message: 'You cannot manage this member' });
    }

    const stopped = await adminForceStopOpenSession(targetUserId, {
      stoppedBy: req.user._id,
      stoppedByName: visibleActorName(req.user, orgId),
      reason,
    });

    if (!stopped) {
      return res.status(404).json({ message: 'No running timer for this member' });
    }

    const who = visibleActorName(req.user, orgId);
    const trimmed = String(reason || '').trim();
    const message = trimmed
      ? `${who} stopped your timer: ${trimmed.slice(0, 200)}`
      : `${who} stopped your timer`;

    const note = await Notification.create({
      organizationId: orgId,
      recipientId: targetUserId,
      actorId: req.user._id,
      type: 'timer_stopped_by_admin',
      message,
      isRead: false,
    });

    const { publishNotificationDocs } = require('../services/notifications');
    const { publishToUsers, publishOrgEvent } = require('../services/realtime');
    publishNotificationDocs([note], { reason: 'timer_stopped_by_admin' });
    publishToUsers(
      orgId,
      [targetUserId],
      {
        type: 'timer',
        reason: 'stopped_by_admin',
        actorId: req.user._id,
      },
      { excludeUserId: req.user._id }
    );
    publishOrgEvent(
      orgId,
      { type: 'team_status', reason: 'timer_stopped', actorId: req.user._id, userId: targetUserId },
      { excludeUserId: req.user._id }
    );

    res.json({
      data: stopped,
      message: 'Timer stopped',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, stopMemberTimer };
