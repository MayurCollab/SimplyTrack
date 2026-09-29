const StageMaster = require('../models/StageMaster');
const Permission = require('../models/Permission');
const { orgFilter } = require('../utils/orgScope');

function normalizeStageType(rawType) {
  return rawType === 'closing_note' ? 'closing_note' : 'workflow';
}

async function hasModulePermission(req, module, action) {
  const user = req.user;
  if (!user) return false;
  if (user.role === 'super_admin' || user.role === 'owner') return true;
  const permission = await Permission.findOne({
    organizationId: user.organizationId,
    role: user.role,
    module,
  }).lean();
  return Boolean(permission?.actions?.[action]);
}

async function guardStagePermission(req, res, action, stageType) {
  const module = stageType === 'closing_note' ? 'closing_note_stages' : 'stages';
  const allowed = await hasModulePermission(req, module, action);
  if (allowed) return true;
  res.status(403).json({ message: `You do not have permission to ${action} ${module}` });
  return false;
}

async function list(req, res, next) {
  try {
    const stageType = normalizeStageType(req.query.type);
    if (!(await guardStagePermission(req, res, 'view', stageType))) return;
    const filter = orgFilter(req.user);
    filter.stageType = stageType;
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
    const stageType = normalizeStageType(req.body.stageType);
    if (!(await guardStagePermission(req, res, 'add', stageType))) return;
    const { systemKey: _ignored, ...body } = req.body;
    const orgId = orgFilter(req.user).organizationId;
    const incomingName = String(body.name || '').trim();
    const duplicate = await StageMaster.findOne({
      organizationId: orgId,
      stageType,
      name: new RegExp(`^${incomingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    }).lean();
    if (duplicate) {
      return res.status(409).json({ message: 'Stage with this name already exists' });
    }
    const stage = await StageMaster.create({
      ...body,
      stageType,
      organizationId: orgId,
      systemKey: null,
    });
    res.status(201).json({ data: stage, message: 'Stage created' });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const existing = await StageMaster.findOne({
      _id: req.params.id,
      ...orgFilter(req.user),
    });
    if (!existing) return res.status(404).json({ message: 'Stage not found' });
    if (!(await guardStagePermission(req, res, 'edit', existing.stageType || 'workflow'))) return;

    const { systemKey: _ignored, stageType: _ignoredType, ...body } = req.body;
    if (body.name != null) {
      const incomingName = String(body.name || '').trim();
      const duplicate = await StageMaster.findOne({
        _id: { $ne: existing._id },
        organizationId: existing.organizationId,
        stageType: existing.stageType || 'workflow',
        name: new RegExp(`^${incomingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();
      if (duplicate) {
        return res.status(409).json({ message: 'Stage with this name already exists' });
      }
    }
    Object.assign(existing, body);
    // Preserve systemKey — never overwrite from client
    await existing.save();
    res.json({ data: existing, message: 'Stage updated' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const existing = await StageMaster.findOne({
      _id: req.params.id,
      ...orgFilter(req.user),
    });
    if (!existing) return res.status(404).json({ message: 'Stage not found' });
    if (!(await guardStagePermission(req, res, 'delete', existing.stageType || 'workflow'))) return;

    if ((existing.stageType || 'workflow') === 'workflow' && existing.systemKey) {
      return res.status(400).json({
        message: 'Cannot delete a system workflow status',
      });
    }

    let inUse = 0;
    if ((existing.stageType || 'workflow') === 'workflow') {
      const Task = require('../models/Task');
      inUse = await Task.countDocuments({
        stageId: req.params.id,
        ...orgFilter(req.user),
      });
    } else {
      const TimeLog = require('../models/TimeLog');
      inUse = await TimeLog.countDocuments({
        closingNoteStageId: req.params.id,
        ...orgFilter(req.user),
      });
    }
    if (inUse > 0) {
      return res.status(400).json({
        message: `Cannot delete stage - it is used by ${inUse} record(s)`,
      });
    }

    await StageMaster.deleteOne({ _id: existing._id });
    res.json({ message: 'Stage deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
