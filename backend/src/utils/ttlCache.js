/**
 * Tiny in-memory TTL cache for hot auth / settings lookups.
 */
function createTtlCache({ ttlMs = 60_000, maxSize = 500 } = {}) {
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value, customTtlMs = ttlMs) {
    if (store.size >= maxSize) {
      const firstKey = store.keys().next().value;
      if (firstKey != null) store.delete(firstKey);
    }
    store.set(key, { value, expiresAt: Date.now() + customTtlMs });
    return value;
  }

  function del(key) {
    store.delete(key);
  }

  function clear() {
    store.clear();
  }

  return { get, set, del, clear };
}

module.exports = { createTtlCache };
