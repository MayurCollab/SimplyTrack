const Permission = require('../models/Permission');

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

      const permission = await Permission.findOne({
        organizationId: user.organizationId,
        role: user.role,
        module,
      });

      if (!permission || !permission.actions?.[action]) {
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
