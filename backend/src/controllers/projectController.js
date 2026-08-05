const ProjectMaster = require('../models/ProjectMaster');
const ClientMaster = require('../models/ClientMaster');
const User = require('../models/User');
const { orgFilter } = require('../utils/orgScope');

const POPULATE = [
  { path: 'clientId', select: 'organizationName email isActive' },
  { path: 'assignedTo', select: 'name email role' },
];

async function list(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const { search, clientId, assigneeId } = req.query;

    if (clientId) filter.clientId = clientId;
    if (assigneeId) filter.assignedTo = assigneeId;
    if (search) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    const projects = await ProjectMaster.find(filter)
      .populate(POPULATE)
      .sort({ name: 1 })
      .lean();

    res.json({ data: projects });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const { name, clientId, assignedTo = [], estimatedTime = 0, isActive } = req.body;

    const client = await ClientMaster.findOne({
      _id: clientId,
      organizationId: orgId,
    });
    if (!client) {
      return res.status(400).json({ message: 'Invalid client' });
    }

    if (assignedTo.length) {
      const count = await User.countDocuments({
        _id: { $in: assignedTo },
        organizationId: orgId,
        isActive: true,
      });
      if (count !== assignedTo.length) {
        return res.status(400).json({ message: 'One or more assignees are invalid' });
      }
    }

    const project = await ProjectMaster.create({
      organizationId: orgId,
      name,
      clientId,
      assignedTo,
      estimatedTime,
      isActive: isActive ?? true,
    });

    const populated = await ProjectMaster.findById(project._id).populate(POPULATE).lean();
    res.status(201).json({ data: populated, message: 'Project created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const orgId = orgFilter(req.user).organizationId;
    const project = await ProjectMaster.findOne({
      _id: req.params.id,
      organizationId: orgId,
    });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const { name, clientId, assignedTo, estimatedTime, isActive } = req.body;

    if (name != null) project.name = name;
    if (estimatedTime != null) project.estimatedTime = estimatedTime;
    if (isActive !== undefined) project.isActive = isActive;

    if (clientId) {
      const client = await ClientMaster.findOne({ _id: clientId, organizationId: orgId });
      if (!client) return res.status(400).json({ message: 'Invalid client' });
      project.clientId = clientId;
    }

    if (assignedTo !== undefined) {
      if (assignedTo.length) {
        const count = await User.countDocuments({
          _id: { $in: assignedTo },
          organizationId: orgId,
        });
        if (count !== assignedTo.length) {
          return res.status(400).json({ message: 'One or more assignees are invalid' });
        }
      }
      project.assignedTo = assignedTo;
    }

    await project.save();
    const populated = await ProjectMaster.findById(project._id).populate(POPULATE).lean();
    res.json({ data: populated, message: 'Project updated' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const project = await ProjectMaster.findOneAndDelete({
      _id: req.params.id,
      ...orgFilter(req.user),
    });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
