import { z } from 'zod';

import { CREDENTIAL_TOKEN_PATTERN } from '../session/auth.ts';
import { languageSchema, type Language } from '../language/language.ts';

/** Workshop identity is deliberately separate from campaign membership (ADR 0038). */
export const WORKSHOP_COOKIE = 'ltw_workshop';
export const workshopIdSchema = z.uuid();
export const workshopRedeemSchema = z
  .object({
    token: z.string().regex(CREDENTIAL_TOKEN_PATTERN),
    replaceSession: z.boolean().optional(),
  })
  .strict();
export const createWorkshopDraftSchema = z
  .object({
    requestId: workshopIdSchema,
    title: z.string().trim().min(1).max(120),
    language: languageSchema,
  })
  .strict();
export const workshopDraftQuerySchema = z.object({ after: workshopIdSchema.optional() }).strict();
export type CreateWorkshopDraft = z.infer<typeof createWorkshopDraftSchema>;
export interface WorkshopSessionView {
  readonly ownerId: string;
}
export interface WorkshopDraftView {
  readonly draftId: string;
  readonly title: string;
  readonly language: Language;
  readonly createdAt: string;
}
export interface WorkshopDraftList {
  readonly drafts: readonly WorkshopDraftView[];
  readonly nextCursor: string | null;
}
