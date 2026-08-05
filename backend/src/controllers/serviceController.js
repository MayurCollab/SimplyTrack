const ServiceMaster = require('../models/ServiceMaster');
const { orgFilter } = require('../utils/orgScope');

async function list(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const search = (req.query.search || '').trim();
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    const services = await ServiceMaster.find(filter).sort({ name: 1 }).lean();
    res.json({ data: services });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const service = await ServiceMaster.create({
      ...req.body,
      organizationId: orgFilter(req.user).organizationId,
    });
    res.status(201).json({ data: service, message: 'Service created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const service = await ServiceMaster.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(req.user) },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json({ data: service, message: 'Service updated' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const service = await ServiceMaster.findOneAndDelete({
      _id: req.params.id,
      ...orgFilter(req.user),
    });
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json({ message: 'Service deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
