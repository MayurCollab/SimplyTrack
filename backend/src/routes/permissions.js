const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, permissionUpdateSchema } = require('../utils/validation');
const permissionController = require('../controllers/permissionController');

const router = express.Router();

router.use(authMiddleware);

router.get('/me', permissionController.getMyPermissions);
router.get('/', permissionMiddleware('permissions', 'view'), permissionController.list);
router.patch(
  '/',
  permissionMiddleware('permissions', 'edit'),
  validate(permissionUpdateSchema),
  permissionController.update
);

module.exports = router;
