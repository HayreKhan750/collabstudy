// Zod validation schemas for CollabStudy
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(8),
  fullName: z.string().optional(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'INVITE_ONLY']),
});

export const createChannelSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  type: z.enum(['TEXT', 'VOICE', 'VIDEO', 'AI_ASSISTANT']),
  isPrivate: z.boolean().default(false),
});

export const createMessageSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['TEXT', 'SYSTEM', 'AI_RESPONSE', 'CODE_SNIPPET']).default('TEXT'),
  parentId: z.string().uuid().optional(),
});
