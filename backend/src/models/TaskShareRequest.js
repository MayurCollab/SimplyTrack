const mongoose = require('mongoose');

const STATUSES = ['pending', 'approved', 'rejected'];

const taskShareRequestSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    requestedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    keepHours: { type: Number, required: true, min: 0 },
    transferHours: { type: Number, required: true, min: 0.01 },
    requesterComment: { type: String, trim: true, default: '' },
    managerComment: { type: String, trim: true, default: '' },
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
  },
  { timestamps: true }
);

taskShareRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
taskShareRequestSchema.index(
  { taskId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('TaskShareRequest', taskShareRequestSchema);
module.exports.STATUSES = STATUSES;
