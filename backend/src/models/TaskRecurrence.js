const mongoose = require('mongoose');

const FREQUENCIES = ['monthly', 'quarterly', 'yearly'];

const recurrenceSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientMaster',
      required: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceMaster',
      required: true,
    },
    frequency: {
      type: String,
      enum: FREQUENCIES,
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    /** Raw compliance period for the next suggested task */
    nextCompliancePeriodInput: { type: String, required: true },
    /** Calendar date when the next recurring suggestion should appear */
    nextSuggestAt: { type: Date, required: true },
    template: {
      assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      helpingMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      stageId: { type: mongoose.Schema.Types.ObjectId, ref: 'StageMaster', required: true },
      priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      budgetHours: { type: Number, required: true },
      description: { type: String, default: '' },
    },
    createdFromTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

recurrenceSchema.index(
  { organizationId: 1, clientId: 1, serviceId: 1 },
  { unique: true }
);
recurrenceSchema.index({ organizationId: 1, isActive: 1, nextSuggestAt: 1 });

module.exports = mongoose.model('TaskRecurrence', recurrenceSchema);
module.exports.FREQUENCIES = FREQUENCIES;
