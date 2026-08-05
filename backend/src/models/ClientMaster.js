const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    organizationName: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true },
    websiteUrl: { type: String, default: '', trim: true },
    timezone: { type: String, default: () => Intl.DateTimeFormat().resolvedOptions().timeZone },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

clientSchema.index({ organizationId: 1, organizationName: 1 });

module.exports = mongoose.model('ClientMaster', clientSchema);
