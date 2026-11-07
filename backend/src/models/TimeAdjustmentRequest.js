const mongoose = require('mongoose');

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const KINDS = ['correct_existing', 'add_missing'];

const timeAdjustmentRequestSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    ticketNumber: { type: String, required: true, trim: true },
    requestedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    kind: { type: String, enum: KINDS, required: true },
    timeLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TimeLog',
      default: null,
    },
    type: {
      type: String,
      enum: ['task', 'break', 'training'],
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    originalStartedAt: { type: Date, default: null },
    originalStoppedAt: { type: Date, default: null },
    originalDurationMinutes: { type: Number, default: null },
    requestedStartedAt: { type: Date, required: true },
    requestedStoppedAt: { type: Date, required: true },
    description: { type: String, trim: true, required: true },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending',
      index: true,
    },
    reviewedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    reviewerComment: { type: String, trim: true, default: '' },
    appliedStartedAt: { type: Date, default: null },
    appliedStoppedAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },
    appliedTimeLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TimeLog',
      default: null,
    },
  },
  { timestamps: true }
);

timeAdjustmentRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
timeAdjustmentRequestSchema.index({ requestedById: 1, createdAt: -1 });
timeAdjustmentRequestSchema.index(
  { timeLogId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending', timeLogId: { $type: 'objectId' } } }
);
timeAdjustmentRequestSchema.index({ organizationId: 1, ticketNumber: 1 }, { unique: true });

module.exports = mongoose.model('TimeAdjustmentRequest', timeAdjustmentRequestSchema);
module.exports.STATUSES = STATUSES;
module.exports.KINDS = KINDS;
