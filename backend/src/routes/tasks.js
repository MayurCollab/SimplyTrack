const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { attachTaskSpecialFlags } = require('../middleware/taskFlags');
const {
  validate,
  taskSchema,
  taskUpdateSchema,
  closingNoteSchema,
} = require('../utils/validation');
const taskController = require('../controllers/taskController');

const router = express.Router();

router.use(authMiddleware);
router.use(attachTaskSpecialFlags);

router.get('/', permissionMiddleware('tasks', 'view'), taskController.list);
router.get('/:id', permissionMiddleware('tasks', 'view'), taskController.getOne);
router.post('/', permissionMiddleware('tasks', 'add'), validate(taskSchema), taskController.create);
router.patch('/:id', permissionMiddleware('tasks', 'edit'), validate(taskUpdateSchema), taskController.update);
router.delete('/:id', permissionMiddleware('tasks', 'delete'), taskController.remove);

router.post('/:id/timer/start', permissionMiddleware('tasks', 'edit'), taskController.startTimer);
router.post(
  '/:id/timer/stop',
  permissionMiddleware('tasks', 'edit'),
  validate(closingNoteSchema),
  taskController.stopTimer
);

module.exports = router;
