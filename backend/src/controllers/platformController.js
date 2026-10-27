const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const User = require('../models/User');
const {
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  authPayload,
} = require('../services/token');
const { buildSessionUser } = require('../services/platformAccess');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function issueSession(res, user, actingOrganizationId) {
  if (actingOrganizationId) {
    user.$locals.actingOrganizationId = String(actingOrganizationId);
  } else if (user.$locals) {
    user.$locals.actingOrganizationId = null;
  }

  const payload = authPayload(user, {
    actingOrganizationId: actingOrganizationId || null,
  });
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  setRefreshCookie(res, refreshToken);

  return {
    accessToken,
    user: await buildSessionUser(user),
  };
}

async function listOrganizations(req, res, next) {
  try {
    const organizations = await Organization.find().sort({ name: 1 }).lean();
    const ownerIds = organizations.map((org) => org.ownerId).filter(Boolean);
    const owners = await User.find({ _id: { $in: ownerIds } })
      .select('name email lastLoginAt')
      .lean();
    const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));

    res.json({
      data: organizations.map((org) => {
        const owner = org.ownerId ? ownerById.get(String(org.ownerId)) : null;
        return {
          _id: org._id,
          name: org.name,
          isActive: org.isActive !== false,
          createdAt: org.createdAt,
          ownerName: owner?.name || '',
          ownerEmail: owner?.email || '',
          ownerLastLoginAt: owner?.lastLoginAt || null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

async function updateOrganizationStatus(req, res, next) {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    organization.isActive = req.body.isActive;
    await organization.save();

    res.json({
      data: { _id: organization._id, isActive: organization.isActive },
      message: organization.isActive ? 'Organization activated' : 'Organization deactivated',
    });
  } catch (err) {
    next(err);
  }
}

async function enterOrganization(req, res, next) {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const organization = await Organization.findById(req.params.id).select('name isActive');
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const session = await issueSession(res, req.user, organization._id);
    res.json({
      ...session,
      message: 'Organization opened',
    });
  } catch (err) {
    next(err);
  }
}

async function exitOrganization(req, res, next) {
  try {
    const session = await issueSession(res, req.user, null);
    res.json({
      ...session,
      message: 'Left organization',
    });
  } catch (err) {
    next(err);
  }
}

async function listAdmins(req, res, next) {
  try {
    const admins = await User.find({ isSuperAdmin: true })
      .select('name email isActive lastLoginAt createdAt')
      .sort({ name: 1 })
      .lean();
    res.json({ data: admins });
  } catch (err) {
    next(err);
  }
}

async function createAdmin(req, res, next) {
  try {
    const name = req.body.name.trim();
    const email = req.body.email.trim().toLowerCase();

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        message: 'This email is already used. Add an admin with a different email.',
      });
    }

    const admin = await User.create({
      name,
      email,
      role: 'super_admin',
      organizationId: null,
      isActive: true,
      isSuperAdmin: true,
    });

    res.status(201).json({
      data: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        isActive: admin.isActive,
        lastLoginAt: admin.lastLoginAt,
        createdAt: admin.createdAt,
      },
      message: 'Admin added. They can sign in with this email.',
    });
  } catch (err) {
    next(err);
  }
}

async function updateAdminStatus(req, res, next) {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const admin = await User.findOne({ _id: req.params.id, isSuperAdmin: true });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    if (req.body.isActive === false) {
      if (String(admin._id) === String(req.user._id)) {
        return res.status(400).json({ message: 'You cannot deactivate your own account' });
      }

      const others = await User.countDocuments({
        isSuperAdmin: true,
        isActive: true,
        _id: { $ne: admin._id },
      });
      if (others < 1) {
        return res.status(400).json({ message: 'At least one admin must stay active' });
      }
    }

    admin.isActive = req.body.isActive;
    await admin.save();

    res.json({
      data: { _id: admin._id, isActive: admin.isActive },
      message: admin.isActive ? 'Admin activated' : 'Admin deactivated',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOrganizations,
  updateOrganizationStatus,
  enterOrganization,
  exitOrganization,
  listAdmins,
  createAdmin,
  updateAdminStatus,
};
