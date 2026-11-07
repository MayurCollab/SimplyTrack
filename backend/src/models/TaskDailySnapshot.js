const mongoose = require('mongoose');

/**
 * Point-in-time task status for one organisation on one IST calendar day.
 * Stored in MongoDB only (not emailed). Captured at 00:00 Asia/Kolkata.
 *
 * Shape: per member → their tasks + counts (e.g. 5 tasks: 3 completed, 2 working).
 */
const taskRowSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    taskCode: { type: String, default: '' },
    title: { type: String, default: '' },
    clientName: { type: String, default: '' },
    serviceName: { type: String, default: '' },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assigneeName: { type: String, default: '' },
    helpingMemberName: { type: String, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    managerName: { type: String, default: '' },
    /** Workflow stage name at capture time (e.g. Working, Review) */
    stageName: { type: String, default: '' },
    priority: { type: String, default: '' },
    dueDate: { type: Date, default: null },
    targetDate: { type: Date, default: null },
    /** Open = still working; Completed / Ignored */
    lifecycle: {
      type: String,
      enum: ['Open', 'Completed', 'Ignored'],
      default: 'Open',
    },
    completedAt: { type: Date, default: null },
    ignoredAt: { type: Date, default: null },
    budgetHours: { type: Number, default: null },
    loggedHours: { type: Number, default: null },
  },
  { _id: false }
);

const memberSnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: 'Unassigned' },
    total: { type: Number, default: 0 },
    /** Still in progress / open on that date */
    working: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    ignored: { type: Number, default: 0 },
    tasks: { type: [taskRowSchema], default: [] },
  },
  { _id: false }
);

const taskDailySnapshotSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    /** IST calendar date this snapshot represents (YYYY-MM-DD) */
    dateKey: { type: String, required: true, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    capturedAt: { type: Date, required: true },
    source: {
      type: String,
      enum: ['midnight', 'manual', 'catchup'],
      default: 'midnight',
    },
    taskCount: { type: Number, default: 0 },
    memberCount: { type: Number, default: 0 },
    summary: {
      open: { type: Number, default: 0 },
      working: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      ignored: { type: Number, default: 0 },
      byStatus: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    /** Per-user rollup: each member’s tasks + status counts for this date */
    members: { type: [memberSnapshotSchema], default: [] },
    /** Flat copy of all task rows (same data as members[].tasks) for filters/export */
    tasks: { type: [taskRowSchema], default: [] },
  },
  { timestamps: true }
);

taskDailySnapshotSchema.index(
  { organizationId: 1, dateKey: 1 },
  { unique: true }
);
taskDailySnapshotSchema.index({ organizationId: 1, capturedAt: -1 });

module.exports = mongoose.model('TaskDailySnapshot', taskDailySnapshotSchema);
