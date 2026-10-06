const mongoose = require('mongoose');
const { DEFAULT_MONTHLY_REPORT_COLUMNS } = require('../constants/monthlyReportColumns');

const monthlyStatusReportSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    sendTime: { type: String, trim: true, default: '23:55' },
    recipientUserIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    externalEmails: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: [],
    },
    selectedColumns: {
      type: [{ type: String, trim: true }],
      default: () => [...DEFAULT_MONTHLY_REPORT_COLUMNS],
    },
    lastSuccessPeriodKey: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
    },
    primaryColor: { type: String, default: '#4F46E5' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    weekStartsOn: { type: String, enum: ['mon', 'sun'], default: 'mon' },
    defaultTimezone: { type: String, default: 'Asia/Kolkata' },
    dailyWorkingHours: { type: Number, default: 8 },
    dailyBreakHours: { type: Number, default: 1 },
    monthlyStatusReport: {
      type: monthlyStatusReportSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
