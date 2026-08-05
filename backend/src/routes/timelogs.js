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

router.get('/active', timelogController.getActive);
router.post('/pending-note', validate(pendingNoteSchema), timelogController.submitPendingNote);

router.post('/break/start', timelogController.startBreak);
router.post('/break/stop', validate(closingNoteSchema), timelogController.stopBreak);

router.post('/training/start', timelogController.startTraining);
router.post('/training/stop', validate(closingNoteSchema), timelogController.stopTraining);

router.patch(
  '/:id/correct',
  permissionMiddleware('tasks', 'edit'),
  validate(correctDurationSchema),
  timelogController.correctDuration
);

module.exports = router;
