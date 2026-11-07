const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

router.use(authMiddleware);
router.get('/overview', permissionMiddleware('dashboard', 'view'), dashboardController.getOverview);

module.exports = router;
