const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    recurrenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskRecurrence',
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
    compliancePeriodInput: { type: String, required: true },
    compliancePeriodValue: { type: String, required: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'dismissed'],
      default: 'pending',
    },
    suggestedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    createdTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
  },
  { timestamps: true }
);

suggestionSchema.index({ organizationId: 1, status: 1 });
suggestionSchema.index(
  { recurrenceId: 1, compliancePeriodInput: 1 },
  { unique: true }
);

module.exports = mongoose.model('TaskSuggestion', suggestionSchema);
