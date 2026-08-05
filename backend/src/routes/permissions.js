const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const permissionController = require('../controllers/permissionController');

const router = express.Router();

router.use(authMiddleware);

router.get('/me', permissionController.getMyPermissions);
router.get('/', permissionController.list);

module.exports = router;
