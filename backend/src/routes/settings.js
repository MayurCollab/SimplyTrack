const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { validate, settingsUpdateSchema } = require('../utils/validation');
const { getSettings, updateSettings } = require('../controllers/settingsController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('settings', 'view'), getSettings);
router.patch(
  '/',
  permissionMiddleware('settings', 'edit'),
  validate(settingsUpdateSchema),
  updateSettings
);

module.exports = router;
