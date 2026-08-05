const Permission = require('../models/Permission');

/**
 * Attaches req.canEditBudgetHours / req.canEditLoggedTime for task routes.
 * Owner/super_admin always true.
 */
async function attachTaskSpecialFlags(req, res, next) {
  try {
    const user = req.user;
    if (!user) return next();

    if (user.role === 'super_admin' || user.role === 'owner') {
      req.canEditBudgetHours = true;
      req.canEditLoggedTime = true;
      return next();
    }

    if (!user.organizationId) {
      req.canEditBudgetHours = false;
      req.canEditLoggedTime = false;
      return next();
    }

    const permission = await Permission.findOne({
      organizationId: user.organizationId,
      role: user.role,
      module: 'tasks',
    }).lean();

    req.canEditBudgetHours = Boolean(permission?.actions?.editBudgetHours);
    req.canEditLoggedTime = Boolean(permission?.actions?.editLoggedTime);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { attachTaskSpecialFlags };
