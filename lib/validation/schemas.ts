import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createOrgSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN','MEMBER','VIEWER']),
});

export const profileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  image: z.string().url().optional().or(z.literal('')),
});

export const memoryCreateSchema = z.object({
  category: z.enum(['business', 'financial', 'goal', 'decision', 'preference']),
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(500),
});

export const memoryUpdateSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  value: z.string().min(1).max(500).optional(),
});

export const trialStartSchema = z.object({
  plan: z.enum(['starter', 'growth']),
  interval: z.enum(['monthly', 'yearly']),
  region: z.enum(['IN', 'INTL']),
});

export const planChangeSchema = z.object({
  plan: z.enum(['starter', 'growth']),
  interval: z.enum(['monthly', 'yearly']),
});

export const cancelSchema = z.object({
  immediate: z.boolean().optional(),
});
