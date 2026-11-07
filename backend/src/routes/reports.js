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
  listDailySnapshots,
  getDailySnapshotDetail,
  downloadDailySnapshot,
  captureDailySnapshotNow,
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

// Daily historical status snapshots — stored in DB only (not emailed)
router.get(
  '/daily-status',
  permissionMiddleware('reports', 'view'),
  listDailySnapshots
);
router.get(
  '/daily-status/detail',
  permissionMiddleware('reports', 'view'),
  getDailySnapshotDetail
);
router.get(
  '/daily-status/download',
  permissionMiddleware('reports', 'view'),
  downloadDailySnapshot
);
router.post(
  '/daily-status/capture',
  permissionMiddleware('reports', 'view'),
  captureDailySnapshotNow
);

module.exports = router;
