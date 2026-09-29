const { z } = require('zod');
const { isValidEmail } = require('./email');
const { COMPLIANCE_PERIOD_TYPES } = require('../constants/compliancePeriod');

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
  stageType: z.enum(['workflow', 'closing_note']).optional().default('workflow'),
  color: z.string().trim().optional().default('#6B7280'),
  order: z.coerce.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  estimatedHours: z.coerce.number().min(0.01, 'Estimated hours must be at least 0.01'),
  turnaroundBusinessDays: z.coerce.number().int().min(0).optional().default(3),
  compliancePeriodType: z.enum(COMPLIANCE_PERIOD_TYPES).optional().default('due_date'),
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

const optionalDate = z.string().optional().nullable();

const reviewPointSchema = z.object({
  _id: z.string().optional(),
  description: z.string().trim().min(1, 'Description is required'),
});

const taskSchema = z.object({
  description: z.string().optional().default(''),
  reviewPoints: z.array(reviewPointSchema).optional().default([]),
  clientId: objectId,
  serviceId: objectId,
  assigneeId: objectId,
  helpingMemberId: z.string().optional().nullable(),
  stageId: objectId,
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  compliancePeriodInput: z.string().trim().min(1, 'Compliance period is required'),
  taskReceiveDate: z.string().or(z.date()),
  querySentDate: optionalDate,
  replyReceivedDate: optionalDate,
  targetDate: optionalDate,
  dueDate: optionalDate,
  budgetHours: z.coerce.number().min(0.01).optional(),
  isRecurring: z.boolean().optional().default(false),
  recurrenceFrequency: z.enum(['monthly', 'quarterly', 'yearly']).optional().nullable(),
  recurrenceStartDate: z.string().or(z.date()).optional().nullable(),
  recurrenceEndDate: z.string().or(z.date()).optional().nullable(),
  alertId: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.isRecurring) {
    if (!data.recurrenceFrequency) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrenceFrequency'],
        message: 'Frequency is required for recurring tasks',
      });
    }
    if (!data.recurrenceStartDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrenceStartDate'],
        message: 'Start date is required for recurring tasks',
      });
    }
  }
});

const taskUpdateSchema = z.object({
  description: z.string().optional(),
  reviewPoints: z.array(reviewPointSchema).optional(),
  clientId: z.string().optional(),
  serviceId: z.string().optional(),
  assigneeId: z.string().optional(),
  helpingMemberId: z.string().optional().nullable(),
  stageId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  compliancePeriodInput: z.string().trim().min(1).optional(),
  taskReceiveDate: z.string().or(z.date()).optional(),
  querySentDate: optionalDate,
  replyReceivedDate: optionalDate,
  targetDate: optionalDate,
  dueDate: z.string().or(z.date()).optional(),
  budgetHours: z.coerce.number().min(0.01).optional(),
});

const closingNoteSchema = z.object({
  closingNote: z
    .string()
    .trim()
    .min(10, 'Closing note must be at least 10 characters'),
  closingNoteStageId: z.string().trim().optional().nullable(),
});

const completeTaskSchema = z.object({
  completionDate: z.string().or(z.date()),
});

const ignoreTaskSchema = z.object({
  ignoreDate: z.string().or(z.date()),
  remarks: z.string().trim().min(1, 'Remarks are required'),
});

const pendingNoteSchema = z.object({
  closingNote: z
    .string()
    .trim()
    .min(10, 'Closing note must be at least 10 characters'),
  closingNoteStageId: z.string().trim().optional().nullable(),
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

const alertSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  days: z.coerce.number().int().min(1, 'Days must be at least 1'),
  order: z.coerce.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const permissionUpdateSchema = z.object({
  items: z
    .array(
      z.object({
        role: z.enum(['manager', 'staff']),
        module: z.string().trim().min(1),
        actions: z
          .object({
            view: z.boolean().optional(),
            add: z.boolean().optional(),
            edit: z.boolean().optional(),
            delete: z.boolean().optional(),
            editBudgetHours: z.boolean().optional(),
            editLoggedTime: z.boolean().optional(),
            complete: z.boolean().optional(),
            ignore: z.boolean().optional(),
            editTargetDate: z.boolean().optional(),
          })
          .optional()
          .default({}),
      })
    )
    .min(1, 'At least one permission update is required'),
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
  completeTaskSchema,
  ignoreTaskSchema,
  pendingNoteSchema,
  correctDurationSchema,
  projectSchema,
  projectUpdateSchema,
  alertSchema,
  permissionUpdateSchema,
  validate,
};
