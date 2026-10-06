const mongoose = require('mongoose');

const orgResultSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    orgName: { type: String, default: '' },
    status: {
      type: String,
      enum: ['success', 'partial', 'failed', 'skipped'],
      required: true,
    },
    reason: { type: String, default: '' },
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'MonthlyReportRun', default: null },
    errorMessage: { type: String, default: '' },
  },
  { _id: false }
);

const monthlyReportJobLogSchema = new mongoose.Schema(
  {
    /** Unique key for this scheduled execution, e.g. monthly-2026-09 */
    jobKey: { type: String, required: true, trim: true, unique: true },
    /** Report month (previous calendar month), e.g. 2026-09 */
    periodKey: { type: String, required: true, trim: true },
    /** Calendar day the cron fired in IST, e.g. 2026-10-01 */
    runDateKey: { type: String, required: true, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    schedule: { type: String, default: '0 6 1 * * Asia/Kolkata' },
    status: {
      type: String,
      enum: ['running', 'success', 'partial', 'failed'],
      default: 'running',
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    orgResults: { type: [orgResultSchema], default: [] },
    totals: {
      orgsEnabled: { type: Number, default: 0 },
      success: { type: Number, default: 0 },
      partial: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    message: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

monthlyReportJobLogSchema.index({ periodKey: 1, createdAt: -1 });
monthlyReportJobLogSchema.index({ startedAt: -1 });

module.exports = mongoose.model('MonthlyReportJobLog', monthlyReportJobLogSchema);
