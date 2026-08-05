const mongoose = require('mongoose');

const timeLogSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    startedAt: { type: Date, required: true },
    stoppedAt: { type: Date, default: null },
    systemDurationMinutes: { type: Number, default: null },
    correctedDurationMinutes: { type: Number, default: null },
    correctedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    correctedAt: { type: Date, default: null },
    closingNote: { type: String, default: '' },
    autoClosedBySwitch: { type: Boolean, default: false },
    pendingClosingNote: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

timeLogSchema.index({ userId: 1, stoppedAt: 1 });
timeLogSchema.index({ organizationId: 1, taskId: 1 });
timeLogSchema.index({ userId: 1, type: 1, startedAt: -1 });

module.exports = mongoose.model('TimeLog', timeLogSchema);
