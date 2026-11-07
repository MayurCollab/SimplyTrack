const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, adminStopTimerSchema } = require('../utils/validation');
const teamStatusController = require('../controllers/teamStatusController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('team_status', 'view'), teamStatusController.list);
router.post(
  '/users/:userId/stop-timer',
  permissionMiddleware('team_status', 'edit'),
  validate(adminStopTimerSchema),
  teamStatusController.stopMemberTimer
);

module.exports = router;
