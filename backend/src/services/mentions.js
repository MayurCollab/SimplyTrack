function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMentions(text, users = [], preferred = []) {
  const content = String(text || '');
  if (!content.includes('@')) return [];

  const preferredIds = new Set(
    (preferred || []).map((item) => String(item.userId || item._id || '')).filter(Boolean)
  );

  const sorted = [...users]
    .filter((user) => user && (user.name || user.email))
    .sort((a, b) => {
      const aLen = Math.max(String(a.name || '').length, String(a.email || '').length);
      const bLen = Math.max(String(b.name || '').length, String(b.email || '').length);
      return bLen - aLen;
    });

  const found = [];
  const seen = new Set();
  for (const user of sorted) {
    const id = String(user._id);
    if (seen.has(id)) continue;
    const tokens = [user.name, user.email].filter(Boolean);
    const matched = tokens.some((token) => {
      const re = new RegExp(`(^|[^\\w])@${escapeRegex(token)}(?=$|[^\\w@])`, 'i');
      return re.test(content);
    });
    if (!matched) continue;
    seen.add(id);
    found.push(user);
  }

  const nameCounts = new Map();
  for (const user of found) {
    const key = String(user.name || '').toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  return found
    .filter((user) => {
      const key = String(user.name || '').toLowerCase();
      if ((nameCounts.get(key) || 0) <= 1) return true;
      if (!preferredIds.size) return true;
      return preferredIds.has(String(user._id));
    })
    .map((user) => ({
      userId: user._id,
      name: user.name || '',
      email: user.email || '',
    }));
}

async function loadMentionUsers(User, organizationId) {
  return User.find({ organizationId, isActive: true })
    .select('_id name email')
    .lean();
}

function withReviewPointMentions(points = [], users = []) {
  return points.map((point) => ({
    ...point,
    mentions: extractMentions(point.description || '', users, point.mentions),
  }));
}

module.exports = {
  extractMentions,
  loadMentionUsers,
  withReviewPointMentions,
};
