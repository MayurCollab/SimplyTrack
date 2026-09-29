function snapshotPoint(point = {}) {
  return {
    description: String(point.description || '').trim(),
    status: point.status || 'pending',
    notes: String(point.notes || '').trim(),
  };
}

function pointsEqual(a, b) {
  return a.description === b.description;
}

function toPlain(point) {
  if (!point) return {};
  return typeof point.toObject === 'function' ? point.toObject() : point;
}

function buildReviewPointHistory({ previous = [], next = [], userId, at = new Date() }) {
  const entries = [];
  const prevList = previous.map(toPlain);
  const nextList = next.map(toPlain);
  const prevById = new Map(
    prevList.filter((p) => p._id).map((p) => [String(p._id), p])
  );
  const matchedPrevIds = new Set();

  for (const point of nextList) {
    const id = point._id ? String(point._id) : '';
    const current = snapshotPoint(point);

    if (id && prevById.has(id)) {
      matchedPrevIds.add(id);
      const old = snapshotPoint(prevById.get(id));
      if (!pointsEqual(old, current)) {
        entries.push({
          action: 'updated',
          changedAt: at,
          changedBy: userId,
          pointId: id,
          ...current,
          previousDescription: old.description,
          previousStatus: old.status,
          previousNotes: old.notes,
        });
      }
      continue;
    }

    entries.push({
      action: 'added',
      changedAt: at,
      changedBy: userId,
      pointId: id || undefined,
      ...current,
    });
  }

  for (const oldPoint of prevList) {
    const id = oldPoint._id ? String(oldPoint._id) : '';
    if (!id || matchedPrevIds.has(id)) continue;
    entries.push({
      action: 'removed',
      changedAt: at,
      changedBy: userId,
      pointId: id,
      ...snapshotPoint(oldPoint),
    });
  }

  return entries;
}

function historyFromCreatedPoints(points = [], userId, at = new Date()) {
  return points.map((point) => {
    const plain = toPlain(point);
    return {
      action: 'added',
      changedAt: at,
      changedBy: userId,
      pointId: plain._id,
      ...snapshotPoint(plain),
    };
  });
}

module.exports = { buildReviewPointHistory, historyFromCreatedPoints };
