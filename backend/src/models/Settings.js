const mongoose = require('mongoose');

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
    defaultTimezone: { type: String, default: () => Intl.DateTimeFormat().resolvedOptions().timeZone },
    dailyWorkingHours: { type: Number, default: 8 },
    dailyBreakHours: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
