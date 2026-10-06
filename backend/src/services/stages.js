const StageMaster = require('../models/StageMaster');

const DEFAULT_STAGES = [
  { name: 'Pending', color: '#6B7280', order: 0, systemKey: 'pending' },
  { name: 'In Progress', color: '#3B82F6', order: 1, systemKey: 'in_progress' },
  { name: 'Query Sent', color: '#F59E0B', order: 2, systemKey: 'query_sent' },
  { name: 'Waiting for Client', color: '#8B5CF6', order: 3, systemKey: 'waiting_client' },
  { name: 'Ready for Review', color: '#10B981', order: 4, systemKey: 'ready_review' },
  { name: 'Completed', color: '#059669', order: 5, systemKey: 'completed' },
  { name: 'Ignored', color: '#9CA3AF', order: 6, systemKey: 'ignored' },
];

const DEFAULT_CLOSING_NOTE_STAGES = [
  'Accruals & Deferred Income',
  'Analysis of Expense',
  'AP/AR Review',
  'Bank Analysis &Reconciliation',
  'BrightWorkPaper',
  'Cashflow',
  'Checklist',
  'Client Communication',
  'Client Registration',
  'Comparatives',
  'Corporation Tax',
  'Creditors Schedule',
  'CSV Preparation',
  'Data Entry',
  'Debtors Schedule',
  'Director Loan Account',
  'Document Publishing',
  'Email Update',
  'Fixed Assets Register',
  'HP/Loan Control Account',
  'Hyperlink/Formatting',
  'Initial Review',
  'Investment',
  'Opening balance adjustment',
  'Other (Write Specific Task on your own)',
  'Other Debtors schedule',
  'Payroll',
  'Prepayment',
  'Purchase Invoices',
  'Query & Reply Review',
  'Sales Invoices',
  'Self Review',
  'Stock',
];

function normalizedStageName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, '&')
    .trim();
}

/** Treat near-duplicate "Other (...)" closing-note labels as one stage. */
function closingStageDedupeKey(name) {
  const normalized = normalizedStageName(name);
  if (!normalized) return '';
  // Only collapse "Other (...)" variants — not names like "Other Debtors schedule".
  if (/^other\s*\(/.test(normalized)) return 'other';
  return normalized;
}

const CANONICAL_OTHER_CLOSING_STAGE = 'Other (Write Specific Task on your own)';

async function seedDefaultStages(organizationId) {
  await StageMaster.updateMany(
    { organizationId, stageType: { $exists: false } },
    { $set: { stageType: 'workflow' } }
  );

  const existing = await StageMaster.countDocuments({ organizationId, stageType: 'workflow' });
  if (existing === 0) {
    const docs = DEFAULT_STAGES.map((stage) => ({
      ...stage,
      organizationId,
      stageType: 'workflow',
      isActive: true,
    }));
    await StageMaster.insertMany(docs);
  } else {
    // Backfill systemKey / missing workflow stages for older orgs
    for (const stage of DEFAULT_STAGES) {
      const byKey = await StageMaster.findOne({
        organizationId,
        stageType: 'workflow',
        systemKey: stage.systemKey,
      });
      if (byKey) continue;

      const byName = await StageMaster.findOne({
        organizationId,
        stageType: 'workflow',
        name: new RegExp(`^${stage.name}$`, 'i'),
      });
      if (byName) {
        if (!byName.systemKey || byName.stageType !== 'workflow') {
          byName.systemKey = stage.systemKey;
          byName.stageType = 'workflow';
          await byName.save();
        }
        continue;
      }

      await StageMaster.create({
        ...stage,
        organizationId,
        stageType: 'workflow',
        isActive: true,
      });
    }
  }

  // Remove duplicate workflow rows (keep oldest) by systemKey or normalized name.
  const workflowStages = await StageMaster.find({
    organizationId,
    stageType: 'workflow',
  }).sort({ createdAt: 1 });
  const seenWorkflowKeys = new Set();
  for (const stage of workflowStages) {
    const key = stage.systemKey
      ? `sys:${String(stage.systemKey).toLowerCase()}`
      : `name:${normalizedStageName(stage.name)}`;
    if (seenWorkflowKeys.has(key)) {
      await StageMaster.deleteOne({ _id: stage._id });
      continue;
    }
    seenWorkflowKeys.add(key);
  }

  const closingNameSet = new Set(DEFAULT_CLOSING_NOTE_STAGES.map(normalizedStageName));
  const wronglyTyped = await StageMaster.find({
    organizationId,
    stageType: 'workflow',
    systemKey: null,
  });
  for (const stage of wronglyTyped) {
    if (!closingNameSet.has(normalizedStageName(stage.name))) continue;
    stage.stageType = 'closing_note';
    await stage.save();
  }

  const closingStages = await StageMaster.find({
    organizationId,
    stageType: 'closing_note',
  }).sort({ createdAt: 1 });

  const seenClosing = new Map();
  for (const stage of closingStages) {
    const key = closingStageDedupeKey(stage.name);
    if (!key) continue;

    const existing = seenClosing.get(key);
    if (!existing) {
      seenClosing.set(key, stage);
      continue;
    }

    // Prefer the canonical "Other (Write Specific Task on your own)" label when collapsing.
    const existingIsCanonical =
      key === 'other' &&
      normalizedStageName(existing.name) === normalizedStageName(CANONICAL_OTHER_CLOSING_STAGE);
    const currentIsCanonical =
      key === 'other' &&
      normalizedStageName(stage.name) === normalizedStageName(CANONICAL_OTHER_CLOSING_STAGE);

    if (currentIsCanonical && !existingIsCanonical) {
      await StageMaster.deleteOne({ _id: existing._id });
      seenClosing.set(key, stage);
      continue;
    }

    await StageMaster.deleteOne({ _id: stage._id });
  }

  const latestClosing = await StageMaster.find({
    organizationId,
    stageType: 'closing_note',
  }).lean();
  const closingByNormalized = new Map(
    latestClosing.map((stage) => [closingStageDedupeKey(stage.name), stage])
  );

  for (const [index, name] of DEFAULT_CLOSING_NOTE_STAGES.entries()) {
    const key = closingStageDedupeKey(name);
    const match = closingByNormalized.get(key);
    if (match) {
      await StageMaster.updateOne(
        { _id: match._id },
        { $set: { name, order: index, isActive: true } }
      );
      continue;
    }

    await StageMaster.create({
      organizationId,
      name,
      stageType: 'closing_note',
      color: '#6B7280',
      order: index,
      systemKey: null,
      isActive: true,
    });
  }
}

async function findStageBySystemKey(organizationId, systemKey) {
  return StageMaster.findOne({
    organizationId,
    stageType: 'workflow',
    systemKey,
    isActive: true,
  });
}

module.exports = {
  seedDefaultStages,
  DEFAULT_STAGES,
  DEFAULT_CLOSING_NOTE_STAGES,
  findStageBySystemKey,
};
