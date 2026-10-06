const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const { connectDB } = require('./config/db');
const { runStartupMigrations } = require('./services/migrations');
const { startRecurringJob } = require('./services/recurringJob');
const { startMonthlyReportJob } = require('./services/monthlyReportJob');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const stageRoutes = require('./routes/stages');
const serviceRoutes = require('./routes/services');
const clientRoutes = require('./routes/clients');
const userRoutes = require('./routes/users');
const permissionRoutes = require('./routes/permissions');
const taskRoutes = require('./routes/tasks');
const timelogRoutes = require('./routes/timelogs');
const projectRoutes = require('./routes/projects');
const alertRoutes = require('./routes/alerts');
const notificationRoutes = require('./routes/notifications');
const taskShareRequestRoutes = require('./routes/taskShareRequests');
const settingsRoutes = require('./routes/settings');
const reportRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

// origin:true reflects the request Origin (works with credentials / cookies)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'simplytrack-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/stages', stageRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/task-share-requests', taskShareRequestRoutes);
app.use('/api/timelogs', timelogRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDB();
  await runStartupMigrations();
  startRecurringJob();
  startMonthlyReportJob();
  app.listen(config.port, () => {
    console.log(`SimplyTrack API running on http://localhost:${config.port}`);
    if (config.isDev) {
      console.log('Dev mode: emails are NOT sent (logged here). OTP codes print in THIS terminal.');
    }
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
