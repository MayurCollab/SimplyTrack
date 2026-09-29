const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, alertSchema } = require('../utils/validation');
const alertController = require('../controllers/alertController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', alertController.list);
router.post('/', permissionMiddleware('alerts', 'add'), validate(alertSchema), alertController.create);
router.patch(
  '/:id',
  permissionMiddleware('alerts', 'edit'),
  validate(alertSchema.partial()),
  alertController.update
);
router.delete('/:id', permissionMiddleware('alerts', 'delete'), alertController.remove);

module.exports = router;
