const cron = require('node-cron');
const { generateDueSuggestions } = require('./recurringTasks');

const JOB_TIMEZONE = 'Asia/Kolkata';

function startRecurringJob() {
  // Every day at 06:00 IST — node-cron may WARN "missed execution" if the
  // process starts after 06:00; that is harmless (we also scan on boot below).
  cron.schedule(
    '0 6 * * *',
    async () => {
      try {
        const created = await generateDueSuggestions();
        if (created > 0) {
          console.log(`Recurring suggestions: created ${created}`);
        }
      } catch (err) {
        console.error('Recurring suggestion job failed:', err.message);
      }
    },
    { timezone: JOB_TIMEZONE }
  );

  // Also run once shortly after boot (covers the same-day missed 06:00 slot)
  setTimeout(async () => {
    try {
      await generateDueSuggestions();
    } catch (err) {
      console.error('Startup suggestion scan failed:', err.message);
    }
  }, 5000);

  console.log(
    `[RecurringTasks] Scheduler started (0 6 * * * ${JOB_TIMEZONE}) + boot scan`
  );
}

module.exports = { startRecurringJob };
