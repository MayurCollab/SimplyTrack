const { z } = require('zod');
const { isValidEmail } = require('./email');

const optionalEmail = z
  .string()
  .trim()
  .default('')
  .refine((val) => !val || isValidEmail(val), {
    message: 'Enter a valid email address',
  });

const requiredEmail = z
  .string()
  .trim()
  .min(1, 'Valid email is required')
  .refine((val) => isValidEmail(val), {
    message: 'Enter a valid email address',
  });

const registerSchema = z.object({
  orgName: z.string().trim().min(1, 'Organization name is required'),
  name: z.string().trim().min(1, 'Owner name is required'),
  email: requiredEmail,
});

const loginSchema = z.object({
  email: requiredEmail,
});

const verifyOtpSchema = z.object({
  email: requiredEmail,
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  purpose: z.enum(['login', 'register']),
});

const stageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  color: z.string().trim().optional().default('#6B7280'),
  order: z.coerce.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  estimatedHours: z.coerce.number().min(0.01, 'Estimated hours must be at least 0.01'),
  isActive: z.boolean().optional().default(true),
});

const clientSchema = z.object({
  organizationName: z.string().trim().min(1, 'Organization name is required'),
  email: optionalEmail,
  websiteUrl: z.string().trim().optional().default(''),
  timezone: z.string().trim().optional().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  description: z.string().optional().default(''),
  isActive: z.boolean().optional().default(true),
});

const userSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: requiredEmail,
  role: z.enum(['manager', 'staff']),
  reportingManagerId: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
}).refine(
  (data) => data.role !== 'staff' || (data.reportingManagerId && data.reportingManagerId.length > 0),
  { message: 'Reporting manager is required for staff', path: ['reportingManagerId'] }
);

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z
    .string()
    .trim()
    .refine((val) => !val || isValidEmail(val), {
      message: 'Enter a valid email address',
    })
    .optional(),
  role: z.enum(['manager', 'staff']).optional(),
  reportingManagerId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const statusSchema = z.object({
  isActive: z.boolean(),
});

const objectId = z.string().min(1, 'Required');

const taskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  clientId: objectId,
  serviceId: objectId,
  assigneeId: objectId,
  helpingMemberId: z.string().optional().nullable(),
  stageId: objectId,
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  dueDate: z.string().or(z.date()),
  budgetHours: z.coerce.number().min(0.01).optional(),
});

const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  clientId: z.string().optional(),
  serviceId: z.string().optional(),
  assigneeId: z.string().optional(),
  helpingMemberId: z.string().optional().nullable(),
  stageId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().or(z.date()).optional(),
  budgetHours: z.coerce.number().min(0.01).optional(),
});

const closingNoteSchema = z.object({
  closingNote: z
    .string()
    .trim()
    .min(15, 'Closing note must be at least 15 characters'),
});

const pendingNoteSchema = z.object({
  closingNote: z
    .string()
    .trim()
    .min(15, 'Closing note must be at least 15 characters'),
  timeLogId: z.string().optional(),
});

const correctDurationSchema = z.object({
  correctedDurationMinutes: z.coerce.number().min(0),
});

const projectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  clientId: objectId,
  assignedTo: z.array(z.string()).optional().default([]),
  estimatedTime: z.coerce.number().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  clientId: z.string().optional(),
  assignedTo: z.array(z.string()).optional(),
  estimatedTime: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  stageSchema,
  serviceSchema,
  clientSchema,
  userSchema,
  userUpdateSchema,
  statusSchema,
  taskSchema,
  taskUpdateSchema,
  closingNoteSchema,
  pendingNoteSchema,
  correctDurationSchema,
  projectSchema,
  projectUpdateSchema,
  validate,
};
