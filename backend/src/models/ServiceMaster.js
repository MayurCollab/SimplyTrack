const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    estimatedHours: { type: Number, required: true, min: 0.01 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ organizationId: 1, name: 1 });

module.exports = mongoose.model('ServiceMaster', serviceSchema);
