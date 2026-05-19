import { z } from 'zod';

export const ASSIGNMENT_TYPES = [
  'homework',
  'lab',
  'exam',
  'essay',
  'project',
  'reading',
  'other',
] as const;

export const assignmentTypeSchema = z.enum(ASSIGNMENT_TYPES);

export const parsedAssignmentSchema = z.object({
  courseCode: z.string().min(1).max(32).nullable(),
  title: z.string().min(1).max(200),
  type: assignmentTypeSchema,
  dueAt: z.string().datetime().nullable(),
  tags: z.array(z.string().max(32)).max(10),
  confidence: z.number().min(0).max(1),
  rawInput: z.string().max(500),
});

export const recurrenceSchema = z.object({
  interval: z.union([z.literal(1), z.literal(2)]),
  byweekday: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  until: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
});

export const createAssignmentSchema = z.object({
  courseCode: z.string().min(1).max(32).nullable(),
  title: z.string().min(1).max(200),
  type: assignmentTypeSchema,
  dueAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
  estimatedHours: z.number().min(0).max(999).optional(),
  tags: z.array(z.string().max(32)).max(10).optional(),
  recurrence: recurrenceSchema.optional(),
});

export const updateAssignmentSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    type: assignmentTypeSchema.optional(),
    dueAt: z.string().datetime().optional(),
    notes: z.string().max(2000).nullable().optional(),
    estimatedHours: z.number().min(0).max(999).nullable().optional(),
    actualHours: z.number().min(0).max(999).nullable().optional(),
    completedAt: z.string().datetime().nullable().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

export const parseInputSchema = z.object({
  input: z.string().min(1).max(500),
  referenceDate: z.string().datetime().optional(),
});

const hexColorRe = /^#[0-9a-fA-F]{6}$/;

export const createCourseSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().max(120).nullable().optional(),
  color: z.string().regex(hexColorRe).optional(),
});

export const updateCourseSchema = z
  .object({
    code: z.string().min(1).max(32).optional(),
    name: z.string().max(120).nullable().optional(),
    color: z.string().regex(hexColorRe).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
const reminderOffsetsSchema = z
  .array(z.number().int().min(0).max(24 * 30)) // up to 30 days
  .min(0)
  .max(8);

export const updateSettingsSchema = z
  .object({
    semesterEndDate: z.union([z.string().regex(isoDateRe), z.null()]).optional(),
    canvasIcsUrl: z.union([z.string().url().max(500), z.literal(''), z.null()]).optional(),
    reminderOffsetsHours: reminderOffsetsSchema.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

// --- Applications ---

export const APPLICATION_STAGES = [
  'applied',
  'oa',
  'phone_screen',
  'technical',
  'onsite',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export const applicationStageSchema = z.enum(APPLICATION_STAGES);

export const createApplicationSchema = z.object({
  company: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  stage: applicationStageSchema.optional(),
  nextAction: z.string().max(200).nullable().optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateApplicationSchema = z
  .object({
    company: z.string().min(1).max(120).optional(),
    role: z.string().min(1).max(120).optional(),
    stage: applicationStageSchema.optional(),
    nextAction: z.string().max(200).nullable().optional(),
    nextActionAt: z.string().datetime().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

// --- Gradescope sync ---

export const gradescopeAssignmentSchema = z.object({
  externalId: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  dueAt: z.string().datetime(),
  externalUrl: z.string().url().max(500).nullable().optional(),
});

export const gradescopeSyncSchema = z.object({
  token: z.string().min(32).max(256),
  courseName: z.string().min(1).max(120),
  assignments: z.array(gradescopeAssignmentSchema).max(200),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type ParseInput = z.infer<typeof parseInputSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type RecurrenceInput = z.infer<typeof recurrenceSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ApplicationStage = z.infer<typeof applicationStageSchema>;
export type GradescopeSyncInput = z.infer<typeof gradescopeSyncSchema>;
export type GradescopeAssignmentInput = z.infer<typeof gradescopeAssignmentSchema>;
