const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, serviceSchema } = require('../utils/validation');
const serviceController = require('../controllers/serviceController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('services', 'view'), serviceController.list);
router.post('/', permissionMiddleware('services', 'add'), validate(serviceSchema), serviceController.create);
router.patch('/:id', permissionMiddleware('services', 'edit'), validate(serviceSchema.partial()), serviceController.update);
router.delete('/:id', permissionMiddleware('services', 'delete'), serviceController.remove);

module.exports = router;
