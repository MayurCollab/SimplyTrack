const ProjectMaster = require('../models/ProjectMaster');
const ClientMaster = require('../models/ClientMaster');
const ServiceMaster = require('../models/ServiceMaster');
const { orgFilter } = require('../utils/orgScope');

const POPULATE = [
  { path: 'clientId', select: 'organizationName email isActive' },
  {
    path: 'serviceIds',
    select: 'name estimatedHours compliancePeriodType turnaroundBusinessDays isActive',
  },
];

async function validateServices(orgId, serviceIds = []) {
  if (!serviceIds.length) {
    return { ok: false, message: 'Select at least one service' };
  }
  const count = await ServiceMaster.countDocuments({
    _id: { $in: serviceIds },
    organizationId: orgId,
    isActive: true,
  });
  if (count !== serviceIds.length) {
    return { ok: false, message: 'One or more services are invalid' };
  }
  return { ok: true };
}

async function list(req, res, next) {
  try {
    const filter = orgFilter(req.user);
    const { search, clientId, serviceId } = req.query;

    if (clientId) filter.clientId = clientId;
    if (serviceId) filter.serviceIds = serviceId;
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
    const { name, clientId, serviceIds = [], isActive } = req.body;

    const client = await ClientMaster.findOne({
      _id: clientId,
      organizationId: orgId,
    });
    if (!client) {
      return res.status(400).json({ message: 'Invalid client' });
    }

    const servicesCheck = await validateServices(orgId, serviceIds);
    if (!servicesCheck.ok) {
      return res.status(400).json({ message: servicesCheck.message });
    }

    const project = await ProjectMaster.create({
      organizationId: orgId,
      name,
      clientId,
      serviceIds,
      isActive: isActive ?? true,
    });

    await project.populate(POPULATE);
    res.status(201).json({ data: project.toObject(), message: 'Project created' });
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

    const { name, clientId, serviceIds, isActive } = req.body;

    if (name != null) project.name = name;
    if (isActive !== undefined) project.isActive = isActive;

    if (clientId) {
      const client = await ClientMaster.findOne({ _id: clientId, organizationId: orgId });
      if (!client) return res.status(400).json({ message: 'Invalid client' });
      project.clientId = clientId;
    }

    if (serviceIds !== undefined) {
      const servicesCheck = await validateServices(orgId, serviceIds);
      if (!servicesCheck.ok) {
        return res.status(400).json({ message: servicesCheck.message });
      }
      project.serviceIds = serviceIds;
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
