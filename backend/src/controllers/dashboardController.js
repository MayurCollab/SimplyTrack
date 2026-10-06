const ClientMaster = require('../models/ClientMaster');
const Task = require('../models/Task');
const User = require('../models/User');
const StageMaster = require('../models/StageMaster');
const { orgFilter } = require('../utils/orgScope');

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function stageIdsByKeys(stages, keys) {
  const set = new Set(keys);
  return stages.filter((s) => set.has(s.systemKey)).map((s) => s._id);
}

async function getOverview(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = addMonths(thisMonthStart, -1);

    const stages = await StageMaster.find({
      ...filter,
      stageType: 'workflow',
      isActive: true,
    })
      .select('_id systemKey name')
      .lean();

    const pendingIds = stageIdsByKeys(stages, ['pending']);
    const inProgressIds = stageIdsByKeys(stages, ['in_progress']);
    const inReviewIds = stageIdsByKeys(stages, ['ready_review']);
    // Waiting on client (and query sent) is the closest system equivalent of "blocked"
    const blockedIds = stageIdsByKeys(stages, ['waiting_client', 'query_sent']);
    const completedIds = stageIdsByKeys(stages, ['completed']);

    const openTaskFilter = {
      ...filter,
      completedAt: null,
      ignoredAt: null,
    };

    const [
      totalClients,
      clientsThisMonth,
      clientsLastMonth,
      totalTasks,
      completedTasks,
      activeStaff,
      newTasks,
      blockedTasks,
      inReview,
      inProgress,
    ] = await Promise.all([
      ClientMaster.countDocuments(filter),
      ClientMaster.countDocuments({
        ...filter,
        createdAt: { $gte: thisMonthStart },
      }),
      ClientMaster.countDocuments({
        ...filter,
        createdAt: { $gte: lastMonthStart, $lt: thisMonthStart },
      }),
      Task.countDocuments(filter),
      Task.countDocuments({
        ...filter,
        completedAt: { $ne: null },
      }),
      User.countDocuments({
        ...filter,
        isActive: true,
        role: { $in: ['owner', 'manager', 'staff'] },
      }),
      pendingIds.length
        ? Task.countDocuments({ ...openTaskFilter, stageId: { $in: pendingIds } })
        : Promise.resolve(0),
      blockedIds.length
        ? Task.countDocuments({ ...openTaskFilter, stageId: { $in: blockedIds } })
        : Promise.resolve(0),
      inReviewIds.length
        ? Task.countDocuments({ ...openTaskFilter, stageId: { $in: inReviewIds } })
        : Promise.resolve(0),
      inProgressIds.length
        ? Task.countDocuments({ ...openTaskFilter, stageId: { $in: inProgressIds } })
        : Promise.resolve(0),
    ]);

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

module.exports = { getOverview };
