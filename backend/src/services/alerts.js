const AlertMaster = require('../models/AlertMaster');

const DEFAULT_ALERTS = [
  { name: 'Days', days: 1, order: 0 },
  { name: '1 Week', days: 7, order: 1 },
  { name: '1 Month', days: 30, order: 2 },
  { name: '3 Months', days: 90, order: 3 },
  { name: 'Quarterly', days: 90, order: 4 },
  { name: 'Yearly', days: 365, order: 5 },
];

async function seedDefaultAlerts(organizationId) {
  const existing = await AlertMaster.countDocuments({ organizationId });
  if (existing > 0) return;

  await AlertMaster.insertMany(
    DEFAULT_ALERTS.map((alert) => ({
      ...alert,
      organizationId,
      isActive: true,
    }))
  );
}

module.exports = { seedDefaultAlerts, DEFAULT_ALERTS };
