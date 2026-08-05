const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, projectSchema, projectUpdateSchema } = require('../utils/validation');
const projectController = require('../controllers/projectController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('projects', 'view'), projectController.list);
router.post('/', permissionMiddleware('projects', 'add'), validate(projectSchema), projectController.create);
router.patch(
  '/:id',
  permissionMiddleware('projects', 'edit'),
  validate(projectUpdateSchema),
  projectController.update
);
router.delete('/:id', permissionMiddleware('projects', 'delete'), projectController.remove);

module.exports = router;
