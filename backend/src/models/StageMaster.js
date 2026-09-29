const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    stageType: {
      type: String,
      enum: ['workflow', 'closing_note'],
      default: 'workflow',
    },
    color: { type: String, default: '#6B7280' },
    order: { type: Number, default: 0 },
    systemKey: { type: String, trim: true, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

stageSchema.index({ organizationId: 1, stageType: 1, name: 1 });

module.exports = mongoose.model('StageMaster', stageSchema);
