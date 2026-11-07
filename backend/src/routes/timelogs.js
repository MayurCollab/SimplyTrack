const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const {
  validate,
  closingNoteSchema,
  pendingNoteSchema,
  correctDurationSchema,
} = require('../utils/validation');
const timelogController = require('../controllers/timelogController');

const router = express.Router();

router.use(authMiddleware);

router.get('/active', permissionMiddleware('timelogs', 'view'), timelogController.getActive);
router.get('/mine', permissionMiddleware('timelogs', 'view'), timelogController.listMine);
router.post(
  '/pending-note',
  permissionMiddleware('timelogs', 'add'),
  validate(pendingNoteSchema),
  timelogController.submitPendingNote
);

router.post('/break/start', permissionMiddleware('timelogs', 'add'), timelogController.startBreak);
router.post(
  '/break/stop',
  permissionMiddleware('timelogs', 'add'),
  validate(closingNoteSchema),
  timelogController.stopBreak
);

router.post(
  '/training/start',
  permissionMiddleware('timelogs', 'add'),
  timelogController.startTraining
);
router.post(
  '/training/stop',
  permissionMiddleware('timelogs', 'add'),
  validate(closingNoteSchema),
  timelogController.stopTraining
);

router.patch(
  '/:id/correct',
  permissionMiddleware('timelogs', 'edit'),
  validate(correctDurationSchema),
  timelogController.correctDuration
);

module.exports = router;
