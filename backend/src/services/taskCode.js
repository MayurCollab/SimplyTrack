const Organization = require('../models/Organization');

/**
 * Atomically allocate the next task sequence for an org and return TSK-000001 format code.
 */
async function generateTaskCode(organizationId) {
  const org = await Organization.findOneAndUpdate(
    { _id: organizationId },
    { $inc: { taskSequence: 1 } },
    { new: true }
  );

  if (!org) throw new Error('Organization not found');

  const seq = org.taskSequence;
  return `TSK-${String(seq).padStart(6, '0')}`;
}

module.exports = { generateTaskCode };
