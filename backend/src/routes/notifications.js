const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);
router.delete('/:id', notificationController.softDelete);

module.exports = router;
