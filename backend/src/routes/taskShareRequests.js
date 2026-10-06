const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, taskShareRequestSchema, taskShareReviewSchema } = require('../utils/validation');
const taskShareController = require('../controllers/taskShareController');

const router = express.Router();

router.use(authMiddleware);

router.get(
  '/',
  permissionMiddleware('tasks', 'view'),
  taskShareController.list
);

router.post(
  '/:requestId/approve',
  permissionMiddleware('tasks', 'edit'),
  validate(taskShareReviewSchema),
  taskShareController.approve
);

router.post(
  '/:requestId/reject',
  permissionMiddleware('tasks', 'edit'),
  validate(taskShareReviewSchema),
  taskShareController.reject
);

module.exports = router;
