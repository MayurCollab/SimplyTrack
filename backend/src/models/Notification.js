const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'mention_description',
  'mention_review_point',
  'review_point_reply',
  'hour_share_requested',
  'hour_share_approved',
  'hour_share_rejected',
];

const notificationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    reviewPointId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    shareRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskShareRequest',
      default: null,
    },
    message: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    /** Soft delete — hidden from panel but kept in DB */
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientId: 1, deletedAt: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, deletedAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
