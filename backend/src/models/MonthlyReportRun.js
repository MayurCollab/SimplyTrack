const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: ['user', 'external'], default: 'external' },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    error: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
  },
  { _id: false }
);

const monthlyReportRunSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    periodKey: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['running', 'success', 'partial', 'failed'],
      default: 'running',
    },
    isTest: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    generatedAt: { type: Date, default: null },
    timezone: { type: String, default: 'Asia/Kolkata' },
    recipientSnapshot: { type: [deliverySchema], default: [] },
    delivery: { type: [deliverySchema], default: [] },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    selectedColumns: { type: [String], default: [] },
    fileName: { type: String, default: '' },
    fileContentType: {
      type: String,
      default: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    fileData: { type: Buffer, default: null },
    errorMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

monthlyReportRunSchema.index(
  { organizationId: 1, periodKey: 1, isTest: 1 },
  {
    unique: true,
    partialFilterExpression: { isTest: false },
  }
);

monthlyReportRunSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('MonthlyReportRun', monthlyReportRunSchema);
