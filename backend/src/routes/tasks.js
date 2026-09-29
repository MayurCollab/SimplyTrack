const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { attachTaskSpecialFlags } = require('../middleware/taskFlags');
const {
  validate,
  taskSchema,
  taskUpdateSchema,
  closingNoteSchema,
  completeTaskSchema,
  ignoreTaskSchema,
} = require('../utils/validation');
const taskController = require('../controllers/taskController');

const router = express.Router();

router.use(authMiddleware);
router.use(attachTaskSpecialFlags);

router.get('/', permissionMiddleware('tasks', 'view'), taskController.list);
router.get(
  '/recurring/check',
  permissionMiddleware('tasks', 'view'),
  taskController.checkRecurring
);
router.get(
  '/suggestions',
  permissionMiddleware('tasks', 'view'),
  taskController.listSuggestions
);
router.post(
  '/suggestions/:id/accept',
  permissionMiddleware('tasks', 'add'),
  taskController.acceptSuggestion
);
router.post(
  '/suggestions/:id/dismiss',
  permissionMiddleware('tasks', 'edit'),
  taskController.dismissSuggestion
);

router.get('/:id', permissionMiddleware('tasks', 'view'), taskController.getOne);
router.post('/', permissionMiddleware('tasks', 'add'), validate(taskSchema), taskController.create);
router.patch('/:id', permissionMiddleware('tasks', 'edit'), validate(taskUpdateSchema), taskController.update);
router.delete('/:id', permissionMiddleware('tasks', 'delete'), taskController.remove);

router.post(
  '/:id/complete',
  permissionMiddleware('tasks', 'complete'),
  validate(completeTaskSchema),
  taskController.complete
);
router.post(
  '/:id/ignore',
  permissionMiddleware('tasks', 'ignore'),
  validate(ignoreTaskSchema),
  taskController.ignore
);

router.post('/:id/timer/start', permissionMiddleware('tasks', 'edit'), taskController.startTimer);
router.post(
  '/:id/timer/stop',
  permissionMiddleware('tasks', 'edit'),
  validate(closingNoteSchema),
  taskController.stopTimer
);

module.exports = router;
