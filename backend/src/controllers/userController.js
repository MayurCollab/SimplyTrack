const User = require('../models/User');
const { orgFilter } = require('../utils/orgScope');

const STAFF_ROLES = ['manager', 'staff'];

async function list(req, res, next) {
  try {
    const filter = { ...orgFilter(req.user), role: { $in: STAFF_ROLES } };
    const search = (req.query.search || '').trim();
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const users = await User.find(filter)
      .populate('reportingManagerId', 'name email')
      .sort({ name: 1 })
      .lean();
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const { name, email, role, reportingManagerId, isActive } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    if (role === 'staff' && reportingManagerId) {
      const manager = await User.findOne({
        _id: reportingManagerId,
        organizationId: orgId,
        role: { $in: ['owner', 'manager'] },
        isActive: true,
      });
      if (!manager) {
        return res.status(400).json({ message: 'Invalid reporting manager' });
      }
    }

    const user = await User.create({
      organizationId: orgId,
      name,
      email,
      role,
      reportingManagerId: role === 'staff' ? reportingManagerId : null,
      isActive: isActive ?? true,
    });

    const populated = await User.findById(user._id)
      .populate('reportingManagerId', 'name email')
      .lean();

    res.status(201).json({ data: populated, message: 'User created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const { name, email, role, reportingManagerId, isActive } = req.body;

    const user = await User.findOne({
      _id: req.params.id,
      organizationId: orgId,
      role: { $in: STAFF_ROLES },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (email && email !== user.email) {
      const existing = await User.findOne({ email, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ message: 'A user with this email already exists' });
      }
    }

    if (role === 'staff' && reportingManagerId) {
      const manager = await User.findOne({
        _id: reportingManagerId,
        organizationId: orgId,
        role: { $in: ['owner', 'manager'] },
        isActive: true,
      });
      if (!manager) {
        return res.status(400).json({ message: 'Invalid reporting manager' });
      }
    }

    user.name = name ?? user.name;
    user.email = email ?? user.email;
    user.role = role ?? user.role;
    user.reportingManagerId = user.role === 'staff' ? (reportingManagerId ?? user.reportingManagerId) : null;
    if (isActive !== undefined) user.isActive = isActive;
    await user.save();

    const populated = await User.findById(user._id)
      .populate('reportingManagerId', 'name email')
      .lean();

    res.json({ data: populated, message: 'User updated' });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        ...orgFilter(req.user),
        role: { $in: STAFF_ROLES },
      },
      { $set: { isActive: req.body.isActive } },
      { new: true }
    ).populate('reportingManagerId', 'name email');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ data: user, message: 'User status updated' });
  } catch (err) {
    next(err);
  }
}

async function listManagers(req, res, next) {
  try {
    const users = await User.find({
      ...orgFilter(req.user),
      role: { $in: ['owner', 'manager'] },
      isActive: true,
    })
      .select('name email role')
      .sort({ name: 1 })
      .lean();
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, updateStatus, listManagers };
