const ClientMaster = require('../models/ClientMaster');
const { orgFilter } = require('../utils/orgScope');

async function list(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const search = (req.query.search || '').trim();
    if (search) {
      filter.$or = [
        { organizationName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const clients = await ClientMaster.find(filter).sort({ organizationName: 1 }).lean();
    res.json({ data: clients });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const client = await ClientMaster.create({
      ...req.body,
      organizationId: orgFilter(req.user).organizationId,
    });
    res.status(201).json({ data: client, message: 'Client created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const client = await ClientMaster.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(req.user) },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ data: client, message: 'Client updated' });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const client = await ClientMaster.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(req.user) },
      { $set: { isActive: req.body.isActive } },
      { new: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ data: client, message: 'Client status updated' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, updateStatus };
