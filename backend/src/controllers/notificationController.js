const Notification = require('../models/Notification');
const { orgFilter } = require('../utils/orgScope');

const POPULATE = [
  { path: 'actorId', select: 'name email' },
  { path: 'taskId', select: 'taskCode title' },
];

const activeFilter = (orgId, userId) => ({
  organizationId: orgId,
  recipientId: userId,
  deletedAt: null,
});

async function list(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

    const notifications = await Notification.find(activeFilter(orgId, req.user._id))
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate(POPULATE)
      .lean();

    res.json({ data: notifications });
  } catch (err) {
    next(err);
  }
}

async function unreadCount(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const count = await Notification.countDocuments({
      ...activeFilter(orgId, req.user._id),
      isRead: false,
    });
    res.json({ data: { count } });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const notification = await Notification.findOneAndUpdate(
      {
        ...activeFilter(orgId, req.user._id),
        _id: req.params.id,
      },
      { isRead: true, readAt: new Date() },
      { returnDocument: 'after' }
    )
      .select('_id isRead readAt')
      .lean();

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ data: notification, message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const result = await Notification.updateMany(
      {
        ...activeFilter(orgId, req.user._id),
        isRead: false,
      },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      data: { modifiedCount: result.modifiedCount },
      message: 'All notifications marked as read',
    });
  } catch (err) {
    next(err);
  }
}

async function softDelete(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const notification = await Notification.findOneAndUpdate(
      {
        ...activeFilter(orgId, req.user._id),
        _id: req.params.id,
      },
      { deletedAt: new Date(), isRead: true, readAt: new Date() },
      { returnDocument: 'after' }
    )
      .select('_id deletedAt isRead')
      .lean();

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ data: notification, message: 'Notification deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, unreadCount, markRead, markAllRead, softDelete };
