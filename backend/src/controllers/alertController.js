const AlertMaster = require('../models/AlertMaster');
const { orgFilter } = require('../utils/orgScope');

async function list(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const search = (req.query.search || '').trim();
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    const alerts = await AlertMaster.find(filter).sort({ order: 1, name: 1 }).lean();
    res.json({ data: alerts });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const name = String(req.body.name || '').trim();
    const days = Number(req.body.days);
    const order = Number.isFinite(Number(req.body.order)) ? Number(req.body.order) : 0;

    const duplicate = await AlertMaster.findOne({
      organizationId: orgId,
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (duplicate) {
      return res.status(409).json({ message: 'An alert with this name already exists' });
    }

    const maxOrder = await AlertMaster.findOne({ organizationId: orgId })
      .sort({ order: -1 })
      .select('order')
      .lean();

    const alert = await AlertMaster.create({
      organizationId: orgId,
      name,
      days,
      order: req.body.order != null ? order : (maxOrder?.order ?? -1) + 1,
      isActive: req.body.isActive !== false,
    });

    res.status(201).json({ data: alert, message: 'Alert created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const existing = await AlertMaster.findOne({
      _id: req.params.id,
      ...orgFilter(req.user),
    });
    if (!existing) return res.status(404).json({ message: 'Alert not found' });

    if (req.body.name != null) {
      const name = String(req.body.name).trim();
      const duplicate = await AlertMaster.findOne({
        organizationId: existing.organizationId,
        _id: { $ne: existing._id },
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (duplicate) {
        return res.status(409).json({ message: 'An alert with this name already exists' });
      }
      existing.name = name;
    }
    if (req.body.days != null) existing.days = req.body.days;
    if (req.body.order != null) existing.order = req.body.order;
    if (req.body.isActive != null) existing.isActive = req.body.isActive;

    await existing.save();
    res.json({ data: existing, message: 'Alert updated' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const existing = await AlertMaster.findOne({
      _id: req.params.id,
      ...orgFilter(req.user),
    });
    if (!existing) return res.status(404).json({ message: 'Alert not found' });

    await AlertMaster.deleteOne({ _id: existing._id });
    res.json({ message: 'Alert deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
