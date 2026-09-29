const cron = require('node-cron');
const { generateDueSuggestions } = require('./recurringTasks');

function startRecurringJob() {
  // Every day at 06:00 server time
  cron.schedule('0 6 * * *', async () => {
    try {
      const created = await generateDueSuggestions();
      if (created > 0) {
        console.log(`Recurring suggestions: created ${created}`);
      }
    } catch (err) {
      console.error('Recurring suggestion job failed:', err.message);
    }
  });

  // Also run once shortly after boot
  setTimeout(async () => {
    try {
      await generateDueSuggestions();
    } catch (err) {
      console.error('Startup suggestion scan failed:', err.message);
    }
  }, 5000);
}

module.exports = { startRecurringJob };
