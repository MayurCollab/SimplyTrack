const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('notifications', 'view'), notificationController.list);
router.get(
  '/unread-count',
  permissionMiddleware('notifications', 'view'),
  notificationController.unreadCount
);
router.patch(
  '/read-all',
  permissionMiddleware('notifications', 'edit'),
  notificationController.markAllRead
);
router.patch(
  '/:id/read',
  permissionMiddleware('notifications', 'edit'),
  notificationController.markRead
);
router.patch(
  '/:id/restore',
  permissionMiddleware('notifications', 'edit'),
  notificationController.restore
);
router.delete(
  '/:id',
  permissionMiddleware('notifications', 'delete'),
  notificationController.softDelete
);

module.exports = router;
