const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, stageSchema } = require('../utils/validation');
const stageController = require('../controllers/stageController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('stages', 'view'), stageController.list);
router.post('/', permissionMiddleware('stages', 'add'), validate(stageSchema), stageController.create);
router.patch('/:id', permissionMiddleware('stages', 'edit'), validate(stageSchema.partial()), stageController.update);
router.delete('/:id', permissionMiddleware('stages', 'delete'), stageController.remove);

module.exports = router;
