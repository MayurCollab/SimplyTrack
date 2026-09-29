const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    days: { type: Number, required: true, min: 1 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

alertSchema.index({ organizationId: 1, name: 1 }, { unique: true });
alertSchema.index({ organizationId: 1, order: 1 });

module.exports = mongoose.model('AlertMaster', alertSchema);
