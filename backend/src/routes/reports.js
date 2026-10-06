const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { monthlyReportTestLimiter } = require('../middleware/rateLimiter');
const {
  listRuns,
  getRun,
  downloadRun,
  listJobLogs,
  sendTest,
} = require('../controllers/reportController');

const router = express.Router();

router.use(authMiddleware);

router.get(
  '/monthly-status',
  permissionMiddleware('reports', 'view'),
  listRuns
);
router.get(
  '/monthly-status/job-logs',
  permissionMiddleware('reports', 'view'),
  listJobLogs
);
router.get(
  '/monthly-status/:id',
  permissionMiddleware('reports', 'view'),
  getRun
);
router.get(
  '/monthly-status/:id/download',
  permissionMiddleware('reports', 'view'),
  downloadRun
);

// TEMPORARY: test send for local/QA against production SMTP. Comment out route after testing.
router.post(
  '/monthly-status/test',
  permissionMiddleware('settings', 'edit'),
  monthlyReportTestLimiter,
  sendTest
);

module.exports = router;
