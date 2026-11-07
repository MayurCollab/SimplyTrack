const { getModuleActions } = require('../services/permissionCache');

/**
 * Attaches task-specific permission flags for task routes.
 * Owner/super_admin always true. Uses the shared permission cache so
 * permissionMiddleware on the same request does not hit Mongo again.
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
      req.canSaveTaskDescription = true;
      req.canEditTaskDescription = true;
      return next();
    }

    if (!user.organizationId) {
      req.canEditBudgetHours = false;
      req.canEditLoggedTime = false;
      req.canCompleteTask = false;
      req.canIgnoreTask = false;
      req.canEditTargetDate = false;
      req.canSaveTaskDescription = false;
      req.canEditTaskDescription = false;
      return next();
    }

    const actions = await getModuleActions(user.organizationId, user.role, 'tasks');
    req.permissionActions = req.permissionActions || {};
    if (actions) req.permissionActions.tasks = actions;

    req.canEditBudgetHours = Boolean(actions?.editBudgetHours);
    req.canEditLoggedTime = Boolean(actions?.editLoggedTime);
    req.canCompleteTask = Boolean(actions?.complete);
    req.canIgnoreTask = Boolean(actions?.ignore);
    req.canEditTargetDate = Boolean(actions?.editTargetDate);
    // Fall back to add/edit for orgs that have not set the new flags yet
    req.canSaveTaskDescription =
      actions?.saveTaskDescription != null
        ? Boolean(actions.saveTaskDescription)
        : Boolean(actions?.add);
    req.canEditTaskDescription =
      actions?.editTaskDescription != null
        ? Boolean(actions.editTaskDescription)
        : Boolean(actions?.edit);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { attachTaskSpecialFlags };
