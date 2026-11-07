/**
 * In-memory SSE hub for live org sync (messages, tags, assigns, requests).
 * Single-process only — fine for SimplyTrack's current deploy model.
 */

const clientsByOrg = new Map(); // orgId -> Set<client>
const clientsByUser = new Map(); // userId -> Set<client>

let nextClientId = 1;

function addToMap(map, key, client) {
  if (!key) return;
  const k = String(key);
  let set = map.get(k);
  if (!set) {
    set = new Set();
    map.set(k, set);
  }
  set.add(client);
}

function removeFromMap(map, key, client) {
  if (!key) return;
  const k = String(key);
  const set = map.get(k);
  if (!set) return;
  set.delete(client);
  if (!set.size) map.delete(k);
}

function writeEvent(client, event) {
  if (client.closed) return false;
  try {
    const payload = JSON.stringify(event);
    client.res.write(`id: ${event.id || Date.now()}\n`);
    client.res.write(`event: ${event.type || 'message'}\n`);
    client.res.write(`data: ${payload}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function registerClient({ res, userId, organizationId }) {
  const client = {
    id: nextClientId++,
    res,
    userId: userId ? String(userId) : null,
    organizationId: organizationId ? String(organizationId) : null,
    closed: false,
  };

  addToMap(clientsByUser, client.userId, client);
  addToMap(clientsByOrg, client.organizationId, client);

  const heartbeat = setInterval(() => {
    if (client.closed) return;
    try {
      client.res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      cleanup();
    }
  }, 25_000);

  function cleanup() {
    if (client.closed) return;
    client.closed = true;
    clearInterval(heartbeat);
    removeFromMap(clientsByUser, client.userId, client);
    removeFromMap(clientsByOrg, client.organizationId, client);
    try {
      client.res.end();
    } catch {
      // already closed
    }
  }

  res.on('close', cleanup);
  res.on('error', cleanup);

  writeEvent(client, {
    id: `hello-${client.id}`,
    type: 'connected',
    at: new Date().toISOString(),
  });

  return { client, cleanup };
}

function deliver(set, event, { excludeUserId } = {}) {
  if (!set?.size) return 0;
  const skip = excludeUserId ? String(excludeUserId) : null;
  let sent = 0;
  for (const client of [...set]) {
    if (client.closed) continue;
    if (skip && client.userId === skip) continue;
    if (writeEvent(client, event)) sent += 1;
  }
  return sent;
}

/**
 * Publish a realtime event.
 * @param {object} opts
 * @param {string|object} opts.organizationId
 * @param {string[]|string} [opts.userIds] - target specific users (also scoped to org when set)
 * @param {boolean} [opts.orgWide] - broadcast to everyone in the org
 * @param {string} [opts.excludeUserId] - usually the actor (already updated locally)
 * @param {object} opts.event - JSON-serializable payload (must include type)
 */
function publishRealtime({
  organizationId,
  userIds,
  orgWide = false,
  excludeUserId,
  event,
} = {}) {
  if (!event?.type) return 0;

  const payload = {
    ...event,
    id: event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: event.at || new Date().toISOString(),
    organizationId: organizationId ? String(organizationId) : event.organizationId || null,
  };

  const opts = { excludeUserId };
  let sent = 0;

  if (orgWide && organizationId) {
    sent += deliver(clientsByOrg.get(String(organizationId)), payload, opts);
  }

  const ids = Array.isArray(userIds) ? userIds : userIds ? [userIds] : [];
  for (const id of ids) {
    if (!id) continue;
    if (excludeUserId && String(id) === String(excludeUserId)) continue;
    const userClients = clientsByUser.get(String(id));
    if (!userClients?.size) continue;
    for (const client of [...userClients]) {
      if (client.closed) continue;
      // If org context exists, only deliver when client is in that org (acting org for vendors)
      if (organizationId && client.organizationId && client.organizationId !== String(organizationId)) {
        continue;
      }
      if (writeEvent(client, payload)) sent += 1;
    }
  }

  return sent;
}

/** Convenience: notify specific users + push org-wide task refresh. */
function publishOrgEvent(organizationId, event, { excludeUserId, userIds } = {}) {
  return publishRealtime({
    organizationId,
    orgWide: true,
    userIds,
    excludeUserId,
    event,
  });
}

function publishToUsers(organizationId, userIds, event, { excludeUserId } = {}) {
  return publishRealtime({
    organizationId,
    userIds,
    excludeUserId,
    event,
  });
}

module.exports = {
  registerClient,
  publishRealtime,
  publishOrgEvent,
  publishToUsers,
};
