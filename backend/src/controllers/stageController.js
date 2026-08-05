const StageMaster = require('../models/StageMaster');
const { orgFilter } = require('../utils/orgScope');

async function list(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const search = (req.query.search || '').trim();
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    const stages = await StageMaster.find(filter).sort({ order: 1, name: 1 }).lean();
    res.json({ data: stages });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const stage = await StageMaster.create({
      ...req.body,
      organizationId: orgFilter(req.user).organizationId,
    });
    res.status(201).json({ data: stage, message: 'Stage created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const stage = await StageMaster.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(req.user) },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!stage) return res.status(404).json({ message: 'Stage not found' });
    res.json({ data: stage, message: 'Stage updated' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const Task = require('../models/Task');
    const inUse = await Task.countDocuments({
      stageId: req.params.id,
      ...orgFilter(req.user),
    });
    if (inUse > 0) {
      return res.status(400).json({
        message: `Cannot delete stage - it is used by ${inUse} task(s)`,
      });
    }

    const stage = await StageMaster.findOneAndDelete({
      _id: req.params.id,
      ...orgFilter(req.user),
    });
    if (!stage) return res.status(404).json({ message: 'Stage not found' });
    res.json({ message: 'Stage deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
