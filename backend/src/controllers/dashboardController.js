const mongoose = require('mongoose');
const ClientMaster = require('../models/ClientMaster');
const Task = require('../models/Task');
const User = require('../models/User');
const StageMaster = require('../models/StageMaster');
const { orgFilter } = require('../utils/orgScope');

const STAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const stageCache = new Map(); // orgId -> { expiresAt, stages }

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function stageIdsByKeys(stages, keys) {
  const set = new Set(keys);
  return stages.filter((s) => set.has(s.systemKey)).map((s) => String(s._id));
}

function countFromFacet(rows) {
  return rows?.[0]?.n ?? 0;
}

function asObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return new mongoose.Types.ObjectId(String(value));
}

async function getWorkflowStages(organizationId) {
  const key = String(organizationId);
  const cached = stageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.stages;
  }

  const stages = await StageMaster.find({
    organizationId,
    stageType: 'workflow',
    isActive: true,
  })
    .select('_id systemKey')
    .lean();

  stageCache.set(key, { stages, expiresAt: Date.now() + STAGE_CACHE_TTL_MS });
  return stages;
}

async function getOverview(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const orgId = asObjectId(filter.organizationId);
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = addMonths(thisMonthStart, -1);

    const [stages, taskFacet, totalClients, clientsThisMonth, clientsLastMonth, activeStaff] =
      await Promise.all([
        getWorkflowStages(orgId),
        Task.aggregate([
          { $match: { organizationId: orgId } },
          {
            $facet: {
              total: [{ $count: 'n' }],
              completed: [
                { $match: { completedAt: { $ne: null } } },
                { $count: 'n' },
              ],
              openByStage: [
                {
                  $match: {
                    completedAt: null,
                    ignoredAt: null,
                  },
                },
                { $group: { _id: '$stageId', n: { $sum: 1 } } },
              ],
            },
          },
        ]),
        // Use countDocuments (casts org id) so client totals stay accurate for all auth contexts
        ClientMaster.countDocuments({ organizationId: orgId }),
        ClientMaster.countDocuments({
          organizationId: orgId,
          createdAt: { $gte: thisMonthStart },
        }),
        ClientMaster.countDocuments({
          organizationId: orgId,
          createdAt: { $gte: lastMonthStart, $lt: thisMonthStart },
        }),
        User.countDocuments({
          organizationId: orgId,
          isActive: true,
          role: { $in: ['owner', 'manager', 'staff'] },
        }),
      ]);

    const pendingIds = new Set(stageIdsByKeys(stages, ['pending']));
    const inProgressIds = new Set(stageIdsByKeys(stages, ['in_progress']));
    const inReviewIds = new Set(stageIdsByKeys(stages, ['ready_review']));
    const blockedIds = new Set(stageIdsByKeys(stages, ['waiting_client', 'query_sent']));

    const taskBuckets = taskFacet[0] || {};
    const totalTasks = countFromFacet(taskBuckets.total);
    const completedTasks = countFromFacet(taskBuckets.completed);

    let newTasks = 0;
    let blockedTasks = 0;
    let inReview = 0;
    let inProgress = 0;
    for (const row of taskBuckets.openByStage || []) {
      const id = String(row._id);
      const n = row.n || 0;
      if (pendingIds.has(id)) newTasks += n;
      if (blockedIds.has(id)) blockedTasks += n;
      if (inReviewIds.has(id)) inReview += n;
      if (inProgressIds.has(id)) inProgress += n;
    }

    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const clientsDelta = clientsThisMonth - clientsLastMonth;

    res.json({
      data: {
        totalClients,
        clientsDelta,
        totalTasks,
        completedTasks,
        completionRate,
        activeStaff,
        newTasks,
        blockedTasks,
        inReview,
        inProgress,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getOverview, clearStageCache: () => stageCache.clear() };
