import { z } from 'zod'
import { isValidEmail } from '@/lib/email'

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .default('')
  .refine((val) => !val || isValidEmail(val), {
    message: 'Enter a valid email address',
  })

const requiredEmail = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .refine((val) => isValidEmail(val), {
    message: 'Enter a valid email address',
  })

export const loginSchema = z.object({
  email: requiredEmail,
})

export const registerSchema = z.object({
  orgName: z.string().trim().min(1, 'Organization name is required'),
  name: z.string().trim().min(1, 'Your name is required'),
  email: requiredEmail,
})

export const verifyOtpSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const stageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  color: z.string().optional().default('#6B7280'),
  order: z.coerce.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
})

export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  estimatedHours: z.coerce.number().min(0.01, 'Must be at least 0.01 hours'),
  isActive: z.boolean().optional().default(true),
})

export const clientSchema = z.object({
  organizationName: z.string().trim().min(1, 'Organization name is required'),
  email: optionalEmail,
  websiteUrl: z.string().optional().default(''),
  timezone: z.string().optional().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  description: z.string().optional().default(''),
  isActive: z.boolean().optional().default(true),
})

export const userSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    email: requiredEmail,
    role: z.enum(['manager', 'staff']),
    reportingManagerId: z.string().optional().default(''),
    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => data.role !== 'staff' || data.reportingManagerId, {
    message: 'Reporting manager is required for staff',
    path: ['reportingManagerId'],
  })

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  clientId: z.string().min(1, 'Client is required'),
  serviceId: z.string().min(1, 'Service is required'),
  assigneeId: z.string().min(1, 'Assignee is required'),
  helpingMemberId: z.string().optional().default(''),
  stageId: z.string().min(1, 'Status is required'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.string().min(1, 'Due date is required'),
  budgetHours: z.coerce.number().min(0.01, 'Budget hours must be at least 0.01'),
})

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  clientId: z.string().min(1, 'Client is required'),
  assignedTo: z.array(z.string()).optional().default([]),
  estimatedTime: z.coerce.number().min(0, 'Estimated time cannot be negative').default(0),
  isActive: z.boolean().optional().default(true),
})
