import {
  ASSET_PURPOSES,
  ASSET_VARIANTS,
  ENTITY_KINDS,
  contentHashSchema,
  type AssetPurpose,
  type CampaignPackage,
  type CampaignRevision,
} from '@ltw/contracts';
import type { ImageBrief } from '@ltw/ai';
import { z } from 'zod';

export const draftImageInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    subject: z
      .object({
        entityId: z.uuid(),
        localKey: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
        kind: z.enum(ENTITY_KINDS),
      })
      .strict(),
    appearance: z.string().trim().min(1).max(4000),
    style: z.string().trim().max(4000),
    note: z.string().trim().min(1).max(300).nullable(),
    purpose: z.enum(ASSET_PURPOSES),
    variant: z.enum(ASSET_VARIANTS),
    label: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,39}$/)
      .nullable(),
    reference: z
      .object({
        candidateId: z.uuid(),
        contentHash: contentHashSchema,
        mediaType: z.enum(['image/png', 'image/webp']),
      })
      .strict()
      .nullable(),
    stylePolicy: z
      .object({ version: z.literal(1), referenceHashes: z.array(contentHashSchema).max(2) })
      .strict(),
  })
  .strict()
  .superRefine((input, context) => {
    const derived = input.purpose !== 'image';
    if (
      (input.variant === 'derived') !== derived ||
      (input.reference !== null) !== derived ||
      (input.label !== null) !== derived ||
      (derived && input.label !== input.purpose)
    )
      context.addIssue({ code: 'custom', message: 'invalid draft reference branch' });
    if (
      input.purpose === 'figure' &&
      !['character', 'npc', 'creature'].includes(input.subject.kind)
    )
      context.addIssue({ code: 'custom', message: 'invalid figure subject' });
    if (input.purpose === 'battle-map' && input.subject.kind !== 'location')
      context.addIssue({ code: 'custom', message: 'invalid map subject' });
  });
export type DraftImageInput = z.infer<typeof draftImageInputSchema>;
export interface DraftImageReference {
  readonly candidateId: string;
  readonly contentHash: string;
  readonly mediaType: 'image/png' | 'image/webp';
  readonly bytes: Uint8Array;
}
export interface DraftImagePreparation {
  readonly revision: CampaignRevision;
  readonly entityId: string;
  readonly purpose: AssetPurpose;
  readonly note?: string | null;
  readonly reference: DraftImageReference | null;
}
export function resolveDraftImageVisual(
  content: CampaignPackage,
  localKey: string,
  purpose: AssetPurpose,
) {
  const exact = content.visuals.filter(
    (item) => item.entity === localKey && item.purpose === purpose,
  );
  if (exact.length > 1) return null;
  if (exact[0]) return exact[0];
  if (purpose === 'image') return null;
  const fallback = content.visuals.filter(
    (item) => item.entity === localKey && item.purpose === 'image',
  );
  return fallback.length === 1 ? (fallback[0] ?? null) : null;
}

/** Only normalized permitted art fields reach the provider, never narrative/private identity. */
export function draftImageBrief(
  input: DraftImageInput,
  reference: ImageBrief['reference'],
  seed: string,
): ImageBrief {
  return {
    seed,
    subject: {
      scope: 'workshop',
      localKey: input.subject.localKey,
      kind: input.subject.kind,
      description: input.appearance,
    },
    variant: input.variant,
    purpose: input.purpose,
    label: input.label,
    note: input.note,
    style: input.style,
    basedOn: input.reference?.contentHash ?? null,
    reference,
  };
}
