const moment = require('moment-timezone');
const Organization = require('../models/Organization');
const TaskDailySnapshot = require('../models/TaskDailySnapshot');
const {
  JOB_TIMEZONE,
  previousIstDateKey,
  captureAllOrganizations,
  captureOrganizationSnapshot,
} = require('./dailyStatusSnapshot');

const JOB_CRON = '0 0 * * *'; // every day at 00:00
const JOB_SCHEDULE_LABEL = '0 0 * * * Asia/Kolkata';

/**
 * Auto-save: if any org is missing yesterday’s IST snapshot, create it.
 * Runs on boot so downtime at midnight still gets data into MongoDB.
 */
async function catchUpMissedDailySnapshot() {
  const dateKey = previousIstDateKey();
  const orgs = await Organization.find({ isActive: { $ne: false } })
    .select('_id name')
    .lean();

  let created = 0;
  let skipped = 0;

  for (const org of orgs) {
    const existing = await TaskDailySnapshot.findOne({
      organizationId: org._id,
      dateKey,
    })
      .select('_id')
      .lean();

    if (existing) {
      skipped += 1;
      continue;
    }

    await captureOrganizationSnapshot({
      organizationId: org._id,
      dateKey,
      source: 'catchup',
    });
    created += 1;
    console.log(
      `[DailySnapshot] Auto-saved ${dateKey} for ${org.name || org._id}`
    );
  }

  console.log(
    `[DailySnapshot] Catch-up ${dateKey}: ${created} saved, ${skipped} already present`
  );
}

function startDailySnapshotJob() {
  const cron = require('node-cron');

  // Automatic save every night at 12:00 AM IST (previous calendar day)
  cron.schedule(
    JOB_CRON,
    async () => {
      const dateKey = previousIstDateKey(moment.tz(JOB_TIMEZONE));
      console.log(
        `[DailySnapshot] Automatic midnight save starting for dateKey=${dateKey}`
      );
      try {
        await captureAllOrganizations({ dateKey, source: 'midnight' });
        console.log(
          `[DailySnapshot] Automatic midnight save finished for ${dateKey}`
        );
      } catch (err) {
        console.error('[DailySnapshot] Midnight save failed:', err.message);
      }
    },
    { timezone: JOB_TIMEZONE }
  );

  // Auto catch-up shortly after boot (no manual click needed)
  setTimeout(() => {
    catchUpMissedDailySnapshot().catch((err) => {
      console.error('[DailySnapshot] Catch-up failed:', err.message);
    });
  }, 10_000);

  console.log(
    `[DailySnapshot] Auto-save ON (${JOB_SCHEDULE_LABEL}) — previous IST day into MongoDB`
  );
}

module.exports = {
  startDailySnapshotJob,
  catchUpMissedDailySnapshot,
  JOB_CRON,
  JOB_TIMEZONE,
};
