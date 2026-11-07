const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const {
  validate,
  timeAdjustmentCreateSchema,
  timeAdjustmentReviewSchema,
} = require('../utils/validation');
const timeAdjustmentController = require('../controllers/timeAdjustmentController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', timeAdjustmentController.list);
router.get('/:id', timeAdjustmentController.getOne);
router.post(
  '/',
  permissionMiddleware('time_adjustments', 'add'),
  validate(timeAdjustmentCreateSchema),
  timeAdjustmentController.create
);
router.post('/:id/cancel', timeAdjustmentController.cancel);
router.post(
  '/:id/approve',
  permissionMiddleware('time_adjustments', 'edit'),
  validate(timeAdjustmentReviewSchema),
  timeAdjustmentController.approve
);
router.post(
  '/:id/reject',
  permissionMiddleware('time_adjustments', 'edit'),
  validate(timeAdjustmentReviewSchema),
  timeAdjustmentController.reject
);

module.exports = router;
