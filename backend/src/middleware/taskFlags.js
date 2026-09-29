const Permission = require('../models/Permission');

/**
 * Attaches task-specific permission flags for task routes.
 * Owner/super_admin always true.
 */
async function attachTaskSpecialFlags(req, res, next) {
  try {
    const user = req.user;
    if (!user) return next();

    if (user.role === 'super_admin' || user.role === 'owner') {
      req.canEditBudgetHours = true;
      req.canEditLoggedTime = true;
      req.canCompleteTask = true;
      req.canIgnoreTask = true;
      req.canEditTargetDate = true;
      return next();
    }

    if (!user.organizationId) {
      req.canEditBudgetHours = false;
      req.canEditLoggedTime = false;
      req.canCompleteTask = false;
      req.canIgnoreTask = false;
      req.canEditTargetDate = false;
      return next();
    }

    const permission = await Permission.findOne({
      organizationId: user.organizationId,
      role: user.role,
      module: 'tasks',
    }).lean();

    req.canEditBudgetHours = Boolean(permission?.actions?.editBudgetHours);
    req.canEditLoggedTime = Boolean(permission?.actions?.editLoggedTime);
    req.canCompleteTask = Boolean(permission?.actions?.complete);
    req.canIgnoreTask = Boolean(permission?.actions?.ignore);
    req.canEditTargetDate = Boolean(permission?.actions?.editTargetDate);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { attachTaskSpecialFlags };
