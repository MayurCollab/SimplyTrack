const mongoose = require('mongoose');

const taggedUserSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    taskCode: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    descriptionMentions: { type: [taggedUserSchema], default: [] },
    descriptionHistory: {
      type: [
        {
          action: {
            type: String,
            enum: ['added', 'updated'],
            required: true,
          },
          changedAt: { type: Date, default: Date.now },
          changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          description: { type: String, trim: true, default: '' },
          previousDescription: { type: String, trim: true, default: '' },
        },
      ],
      default: [],
    },
    reviewPoints: {
      type: [
        {
          description: { type: String, trim: true, default: '' },
          descriptionEditedAt: { type: Date, default: null },
          descriptionDeletedAt: { type: Date, default: null },
          status: {
            type: String,
            enum: ['pending', 'in_progress', 'done'],
            default: 'pending',
          },
          notes: { type: String, trim: true, default: '' },
          mentions: { type: [taggedUserSchema], default: [] },
          replies: {
            type: [
              {
                authorId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: 'User',
                  required: true,
                },
                authorName: { type: String, trim: true, default: '' },
                message: { type: String, trim: true, required: true },
                // Quote / reply-to a specific message (null = review point root when preview set)
                replyToId: {
                  type: mongoose.Schema.Types.ObjectId,
                  default: null,
                },
                replyToPreview: { type: String, trim: true, default: '' },
                replyToAuthorName: { type: String, trim: true, default: '' },
                editedAt: { type: Date, default: null },
                deletedAt: { type: Date, default: null },
                createdAt: { type: Date, default: Date.now },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
    reviewPointsHistory: {
      type: [
        {
          action: {
            type: String,
            enum: ['added', 'updated', 'removed'],
            required: true,
          },
          changedAt: { type: Date, default: Date.now },
          changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          pointId: { type: mongoose.Schema.Types.ObjectId, default: null },
          description: { type: String, trim: true, default: '' },
          status: {
            type: String,
            enum: ['pending', 'in_progress', 'done'],
            default: 'pending',
          },
          notes: { type: String, trim: true, default: '' },
          previousDescription: { type: String, trim: true, default: '' },
          previousStatus: { type: String, default: '' },
          previousNotes: { type: String, trim: true, default: '' },
        },
      ],
      default: [],
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectMaster',
      default: null,
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
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    helpingMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isShared: { type: Boolean, default: false },
    assigneeAllocatedHours: { type: Number, default: null, min: 0 },
    helperAllocatedHours: { type: Number, default: null, min: 0 },
    stageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StageMaster',
      required: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    compliancePeriodInput: { type: String, default: '' },
    compliancePeriodValue: { type: String, default: '' },
    dueDate: { type: Date, required: true },
    taskReceiveDate: { type: Date, default: null },
    querySentDate: { type: Date, default: null },
    replyReceivedDate: { type: Date, default: null },
    targetDate: { type: Date, default: null },
    budgetHours: { type: Number, required: true, min: 0.01 },
    totalLoggedMinutes: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    ignoredAt: { type: Date, default: null },
    ignoreRemarks: { type: String, default: '' },
    recurrenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskRecurrence',
      default: null,
    },
    alertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AlertMaster',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

taskSchema.index({ organizationId: 1, dueDate: -1 });
taskSchema.index({ organizationId: 1, assigneeId: 1 });
taskSchema.index({ organizationId: 1, helpingMemberId: 1 });
taskSchema.index({ organizationId: 1, stageId: 1 });
taskSchema.index({ organizationId: 1, targetDate: 1 });
taskSchema.index({ organizationId: 1, taskCode: 1 }, { unique: true, sparse: true });
taskSchema.index({ organizationId: 1, completedAt: 1 });
taskSchema.index({ organizationId: 1, completedAt: 1, ignoredAt: 1, stageId: 1 });

module.exports = mongoose.model('Task', taskSchema);
