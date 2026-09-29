const mongoose = require('mongoose');
const { COMPLIANCE_PERIOD_TYPES } = require('../constants/compliancePeriod');

const serviceSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    estimatedHours: { type: Number, required: true, min: 0.01 },
    turnaroundBusinessDays: { type: Number, default: 3, min: 0 },
    compliancePeriodType: {
      type: String,
      enum: COMPLIANCE_PERIOD_TYPES,
      default: 'due_date',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ organizationId: 1, name: 1 });

module.exports = mongoose.model('ServiceMaster', serviceSchema);
