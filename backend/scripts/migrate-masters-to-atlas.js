/**
 * Copy ServiceMaster + StageMaster docs from local MongoDB to Atlas,
 * remapping organizationId to the matching org on the target (matched by name).
 *
 * Usage:
 *   node scripts/migrate-masters-to-atlas.js
 *   node scripts/migrate-masters-to-atlas.js --dry-run
 *
 * Env (optional overrides):
 *   SOURCE_MONGO_URI  default mongodb://127.0.0.1:27017/simplytrack
 *   TARGET_MONGO_URI  Atlas URI (required unless passed as --target=...)
 */
require('dotenv').config();
const mongoose = require('mongoose');

const SOURCE_URI =
  process.env.SOURCE_MONGO_URI || 'mongodb://127.0.0.1:27017/simplytrack';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetArg = args.find((a) => a.startsWith('--target='));
const TARGET_URI =
  (targetArg && targetArg.slice('--target='.length)) ||
  process.env.TARGET_MONGO_URI ||
  process.env.ATLAS_MONGO_URI;

function normalizeOrgName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMeta(doc) {
  const { _id, __v, organizationId, ...rest } = doc;
  return rest;
}

async function upsertMany(collection, docs, keyFn) {
  let inserted = 0;
  let updated = 0;
  for (const doc of docs) {
    const filter = keyFn(doc);
    const existing = await collection.findOne(filter);
    if (existing) {
      await collection.updateOne(
        { _id: existing._id },
        { $set: { ...stripMeta(doc), organizationId: doc.organizationId } }
      );
      updated += 1;
    } else {
      await collection.insertOne({
        ...stripMeta(doc),
        organizationId: doc.organizationId,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date(),
      });
      inserted += 1;
    }
  }
  return { inserted, updated };
}

async function main() {
  if (!TARGET_URI) {
    throw new Error('TARGET_MONGO_URI (or --target=...) is required');
  }
  if (SOURCE_URI === TARGET_URI) {
    throw new Error('Source and target URIs must be different');
  }

  console.log('Source:', SOURCE_URI.replace(/\/\/.*@/, '//***@'));
  console.log('Target:', TARGET_URI.replace(/\/\/.*@/, '//***@'));
  console.log('Mode:', dryRun ? 'DRY RUN' : 'WRITE');

  const source = await mongoose.createConnection(SOURCE_URI).asPromise();
  const target = await mongoose.createConnection(TARGET_URI).asPromise();

  const sourceOrgs = await source.db.collection('organizations').find({}).toArray();
  const targetOrgs = await target.db.collection('organizations').find({}).toArray();

  const targetByName = new Map(
    targetOrgs.map((o) => [normalizeOrgName(o.name), o])
  );

  const orgMap = []; // { sourceId, targetId, name }
  for (const src of sourceOrgs) {
    const match = targetByName.get(normalizeOrgName(src.name));
    if (match) {
      orgMap.push({
        sourceId: src._id,
        targetId: match._id,
        name: src.name,
      });
      console.log(
        `Org map: "${src.name}"  ${src._id}  →  ${match._id}`
      );
    } else {
      console.log(`Skip org (not on target): "${src.name}" (${src._id})`);
    }
  }

  if (orgMap.length === 0) {
    throw new Error(
      'No matching organizations by name between source and target. Create the org on Atlas first (or rename to match).'
    );
  }

  let totalServices = { inserted: 0, updated: 0, skipped: 0 };
  let totalStages = { deleted: 0, inserted: 0 };

  for (const { sourceId, targetId, name } of orgMap) {
    const services = await source.db
      .collection('servicemasters')
      .find({ organizationId: sourceId })
      .toArray();
    const stages = await source.db
      .collection('stagemasters')
      .find({ organizationId: sourceId })
      .toArray();

    console.log(
      `\n[${name}] local services=${services.length}, local stages=${stages.length}`
    );

    const remappedServices = services.map((s) => ({
      ...s,
      organizationId: targetId,
    }));
    const remappedStages = stages.map((s) => ({
      ...s,
      organizationId: targetId,
    }));

    if (dryRun) {
      console.log(
        `  would upsert ${remappedServices.length} services, replace ${remappedStages.length} stages`
      );
      continue;
    }

    const svcResult = await upsertMany(
      target.db.collection('servicemasters'),
      remappedServices,
      (doc) => ({
        organizationId: targetId,
        name: new RegExp(`^${escapeRegex(doc.name)}$`, 'i'),
      })
    );
    totalServices.inserted += svcResult.inserted;
    totalServices.updated += svcResult.updated;
    console.log(
      `  services: inserted=${svcResult.inserted}, updated=${svcResult.updated}`
    );

    // Replace stages for this org with local set (Atlas has default seeds; local is source of truth)
    const del = await target.db
      .collection('stagemasters')
      .deleteMany({ organizationId: targetId });
    totalStages.deleted += del.deletedCount || 0;

    if (remappedStages.length > 0) {
      const toInsert = remappedStages.map((s) => ({
        ...stripMeta(s),
        organizationId: targetId,
        createdAt: s.createdAt || new Date(),
        updatedAt: s.updatedAt || new Date(),
      }));
      const ins = await target.db.collection('stagemasters').insertMany(toInsert);
      totalStages.inserted += Object.keys(ins.insertedIds).length;
    }
    console.log(
      `  stages: deleted=${del.deletedCount || 0}, inserted=${remappedStages.length}`
    );
  }

  if (!dryRun) {
    for (const { targetId, name } of orgMap) {
      const svcCount = await target.db
        .collection('servicemasters')
        .countDocuments({ organizationId: targetId });
      const stgCount = await target.db
        .collection('stagemasters')
        .countDocuments({ organizationId: targetId });
      console.log(`\nVerify [${name}] on target: services=${svcCount}, stages=${stgCount}`);
    }
  }

  console.log('\nDone.', { totalServices, totalStages });

  await source.close();
  await target.close();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch(async (err) => {
  console.error('\nMigration failed:', err.message || err);
  process.exitCode = 1;
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
});
