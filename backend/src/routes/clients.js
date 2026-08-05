const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, clientSchema, statusSchema } = require('../utils/validation');
const clientController = require('../controllers/clientController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('clients', 'view'), clientController.list);
router.post('/', permissionMiddleware('clients', 'add'), validate(clientSchema), clientController.create);
router.patch('/:id', permissionMiddleware('clients', 'edit'), validate(clientSchema.partial()), clientController.update);
router.patch('/:id/status', permissionMiddleware('clients', 'edit'), validate(statusSchema), clientController.updateStatus);

module.exports = router;
