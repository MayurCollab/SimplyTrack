const User = require('../models/User');

/**
 * Users visible on the team status board.
 * Manager → direct reports only (reportingManagerId).
 * Owner / super_admin → all active org members.
 */
async function fetchTeamMembers(orgId, viewer) {
  if (!orgId || !viewer) return [];

  const base = {
    organizationId: orgId,
    isActive: true,
    isSuperAdmin: { $ne: true },
    role: { $ne: 'owner' },
  };

  const role = viewer.role;
  if (role === 'manager') {
    base.reportingManagerId = viewer._id;
  } else if (role !== 'owner' && role !== 'super_admin') {
    return [];
  }

  return User.find(base)
    .select('name email role reportingManagerId lastLoginAt lastLoginIp lastLoginUserAgent')
    .populate('reportingManagerId', 'name email')
    .sort({ name: 1 })
    .lean();
}

function groupMembersByManager(members) {
  const groups = new Map();

  for (const member of members) {
    const mgr = member.reportingManagerId;
    const managerId = mgr?._id ? String(mgr._id) : mgr ? String(mgr) : 'none';
    const managerName = mgr?.name || 'No manager';

    if (!groups.has(managerId)) {
      groups.set(managerId, {
        managerId: managerId === 'none' ? null : managerId,
        managerName,
        members: [],
      });
    }
    groups.get(managerId).members.push(member);
  }

  return [...groups.values()].sort((a, b) =>
    (a.managerName || '').localeCompare(b.managerName || '')
  );
}

async function canViewTeamMember(viewer, orgId, targetUserId) {
  if (!viewer || !targetUserId) return false;
  if (viewer.role === 'super_admin' || viewer.role === 'owner') return true;

  if (viewer.role === 'manager') {
    const target = await User.findOne({
      _id: targetUserId,
      organizationId: orgId,
      isActive: true,
    })
      .select('reportingManagerId')
      .lean();
    if (!target) return false;
    return String(target.reportingManagerId || '') === String(viewer._id);
  }

  return false;
}

module.exports = { fetchTeamMembers, groupMembersByManager, canViewTeamMember };
