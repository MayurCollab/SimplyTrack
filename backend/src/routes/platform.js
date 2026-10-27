const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { validate, statusSchema, platformAdminSchema } = require('../utils/validation');
const platformController = require('../controllers/platformController');

const router = express.Router();

router.use(authMiddleware);

router.use((req, res, next) => {
  if (!req.user?.isSuperAdmin) {
    return res.status(404).json({ message: 'Route not found' });
  }
  next();
});

router.get('/organizations', platformController.listOrganizations);
router.patch(
  '/organizations/:id/status',
  validate(statusSchema),
  platformController.updateOrganizationStatus
);
router.post('/organizations/:id/enter', platformController.enterOrganization);
router.post('/exit', platformController.exitOrganization);
router.get('/admins', platformController.listAdmins);
router.post('/admins', validate(platformAdminSchema), platformController.createAdmin);
router.patch('/admins/:id/status', validate(statusSchema), platformController.updateAdminStatus);

module.exports = router;
