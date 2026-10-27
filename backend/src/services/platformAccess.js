const Organization = require('../models/Organization');
const User = require('../models/User');

const SEED_EMAIL = 'mayur.kumadra@collabsoftech.com';

const PERSON_FIELDS = [
  'createdBy',
  'reviewPointsHistory.changedBy',
  'timeLogs.userId',
  'timeLogs.correctedBy',
  'requestedById',
  'reviewedById',
  'actorId',
];

function readId(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    return null;
  }
  return String(value);
}

function visit(node, parts, fn) {
  if (node == null) return;
  if (!parts.length) {
    fn(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) visit(item, parts, fn);
    return;
  }
  const [head, ...rest] = parts;
  visit(node[head], rest, fn);
}

/**
 * The seed address already owns an organization. Keep that membership and role,
 * and only grant vendor access. A brand-new address becomes a platform account
 * with no organization.
 */
async function ensureSeedSuperAdmin() {
  const existing = await User.findOne({ email: SEED_EMAIL });
  if (existing) {
    if (!existing.isSuperAdmin) {
      existing.isSuperAdmin = true;
      await existing.save();
    }
    return existing;
  }

  return User.create({
    name: 'Mayur Kumadra',
    email: SEED_EMAIL,
    role: 'super_admin',
    organizationId: null,
    isActive: true,
    isSuperAdmin: true,
  });
}

async function organizationBlockMessage(user) {
  if (!user || user.isSuperAdmin) return null;
  if (!user.organizationId) return 'No organization context';
  const org = await Organization.findById(user.organizationId).select('isActive');
  if (!org || org.isActive === false) return 'This organization is not active';
  return null;
}

function visibleActorName(user, organizationId) {
  if (!user?.isSuperAdmin) return user?.name || 'Someone';
  const home = user.organizationId ? String(user.organizationId) : '';
  const org = organizationId ? String(organizationId) : '';
  if (home && home === org) return user.name || 'Someone';
  return 'System';
}

async function buildSessionUser(user) {
  const actingId = user?.isSuperAdmin ? user.$locals?.actingOrganizationId : null;
  let acting = null;
  if (actingId) {
    acting = await Organization.findById(actingId).select('name isActive');
  }

  let organization = null;
  if (!acting && !user.isSuperAdmin && user.organizationId) {
    organization = await Organization.findById(user.organizationId).select('name isActive');
  }

  const session = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: acting ? acting._id : user.isSuperAdmin ? null : user.organizationId || null,
    organizationName: acting ? acting.name : user.isSuperAdmin ? null : organization?.name || null,
  };

  if (user.isSuperAdmin) {
    session.isSuperAdmin = true;
    session.actingOrganizationId = acting ? String(acting._id) : null;
  }

  return session;
}

async function maskActors(records) {
  const list = (Array.isArray(records) ? records : [records]).filter(Boolean);
  if (!list.length) return records;

  const ids = new Set();
  for (const record of list) {
    for (const field of PERSON_FIELDS) {
      visit(record, field.split('.'), (value) => {
        const id = readId(value);
        if (id) ids.add(id);
      });
    }
    for (const point of record.reviewPoints || []) {
      for (const reply of point.replies || []) {
        const id = readId(reply.authorId);
        if (id) ids.add(id);
      }
    }
  }
  if (!ids.size) return records;

  const admins = await User.find({ _id: { $in: [...ids] }, isSuperAdmin: true })
    .select('organizationId')
    .lean();
  if (!admins.length) return records;

  const homes = new Map(admins.map((admin) => [String(admin._id), admin.organizationId || null]));

  const isForeign = (id, recordOrg) => {
    if (!id || !homes.has(String(id))) return false;
    return String(homes.get(String(id)) || '') !== String(recordOrg || '');
  };

  const maskPerson = (person, recordOrg) => {
    if (!person || typeof person !== 'object') return;
    if (!isForeign(readId(person), recordOrg)) return;
    person.name = 'System';
    if ('email' in person) person.email = '';
  };

  for (const record of list) {
    const recordOrg = record.organizationId;
    for (const field of PERSON_FIELDS) {
      visit(record, field.split('.'), (value) => maskPerson(value, recordOrg));
    }
    for (const point of record.reviewPoints || []) {
      for (const reply of point.replies || []) {
        if (!isForeign(readId(reply.authorId), recordOrg)) continue;
        reply.authorName = 'System';
        if (reply.authorId && typeof reply.authorId === 'object') {
          reply.authorId.name = 'System';
          reply.authorId.email = '';
        }
      }
    }
  }

  return records;
}

module.exports = {
  SEED_EMAIL,
  ensureSeedSuperAdmin,
  organizationBlockMessage,
  visibleActorName,
  buildSessionUser,
  maskActors,
};
