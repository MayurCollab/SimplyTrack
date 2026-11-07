const { getModuleActions } = require('../services/permissionCache');

function permissionMiddleware(module, action) {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (user.role === 'super_admin' || user.role === 'owner') {
        return next();
      }

      if (!user.organizationId) {
        return res.status(403).json({ message: 'No organization context' });
      }

      // Reuse actions already loaded on this request (e.g. attachTaskSpecialFlags)
      let actions = req.permissionActions?.[module];
      if (!actions) {
        actions = await getModuleActions(user.organizationId, user.role, module);
        req.permissionActions = req.permissionActions || {};
        if (actions) req.permissionActions[module] = actions;
      }

      if (!actions?.[action]) {
        return res.status(403).json({
          message: `You do not have permission to ${action} ${module}`,
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { permissionMiddleware };
