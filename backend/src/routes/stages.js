const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { validate, stageSchema } = require('../utils/validation');
const stageController = require('../controllers/stageController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', stageController.list);
router.post('/', validate(stageSchema), stageController.create);
router.patch('/:id', validate(stageSchema.partial()), stageController.update);
router.delete('/:id', stageController.remove);

module.exports = router;
