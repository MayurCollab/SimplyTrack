/**
 * Fix users whose organizationId points at a missing org by attaching them
 * to the Collab Softech org that owns services/stages on Atlas.
 *
 * Usage: node scripts/fix-orphan-org-users.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI || process.env.TARGET_MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is required');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const targetOrg = await db.collection('organizations').findOne({
    name: { $regex: /^collab softech$/i },
  });
  if (!targetOrg) throw new Error('Collab Softech organization not found');

  const users = await db.collection('users').find({}).toArray();
  const orgIds = new Set(
    (await db.collection('organizations').find({}).project({ _id: 1 }).toArray()).map((o) =>
      String(o._id)
    )
  );

  let fixed = 0;
  for (const user of users) {
    const oid = user.organizationId ? String(user.organizationId) : null;
    if (!oid || orgIds.has(oid)) {
      console.log(`ok  ${user.email} → org ${oid}`);
      continue;
    }
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { organizationId: targetOrg._id } }
    );
    fixed += 1;
    console.log(
      `fix ${user.email}: orphan org ${oid} → ${String(targetOrg._id)} (${targetOrg.name})`
    );
  }

  console.log(`\nDone. Fixed ${fixed} user(s).`);
  console.log('Re-login required so the JWT picks up the new organizationId.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
});
