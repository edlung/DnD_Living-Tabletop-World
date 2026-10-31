import { z } from 'zod';

import { contentHashSchema } from '../assets/commands.ts';
import { workshopIdSchema } from '../workshop/access.ts';
import type { CampaignPackage } from './package.ts';
import type { DraftLockSnapshot } from './locks.ts';

export const CAMPAIGN_EDIT_SECTIONS = [
  'brief',
  'world',
  'entities',
  'party',
  'knowledge',
  'relationships',
  'clues',
  'conflicts',
  'situations',
  'encounters',
  'quests',
  'visuals',
  'firstSession',
  'laterOutline',
] as const satisfies readonly Exclude<keyof CampaignPackage, 'schemaVersion'>[];
export type CampaignEditSection = (typeof CAMPAIGN_EDIT_SECTIONS)[number];
/** Server-catalog identity, never a display name, array position or compiler path. */
export const campaignEditTargetIdSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(
    /^(?:section:(?:brief|world|entities|party|knowledge|relationships|clues|conflicts|situations|encounters|quests|visuals|firstSession|laterOutline)|(?:entity|knowledge|clue|encounter|relationship):[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}|(?:situation|conflict|quest):[a-z][a-z0-9-]{0,47}|visual:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}:(?:image|figure|battle-map))$/,
  );
export interface CampaignEditTarget {
  readonly targetId: string;
  /** Owner-only stable local key; sections use null. Never a display alias or row index. */
  readonly key: string | null;
  readonly label: string;
  readonly section: CampaignEditSection;
  readonly locked: boolean;
  readonly ambiguous: boolean;
}
export const campaignEditTargetSchema = z
  .object({
    targetId: campaignEditTargetIdSchema,
    key: z.string().min(1).max(200).nullable(),
    label: z.string().min(1).max(4000),
    section: z.enum(CAMPAIGN_EDIT_SECTIONS),
    locked: z.boolean(),
    ambiguous: z.boolean(),
  })
  .strict();
export interface CampaignEditClosureItem {
  readonly targetId: string;
  readonly reasons: readonly string[];
  readonly readOnly: boolean;
}
/** Frozen server-resolved scope. A provider cannot enlarge it in its output. */
export interface CampaignEditSpec {
  readonly version: 1;
  readonly baselineDigest: string;
  readonly instruction: string;
  readonly requestedTargets: readonly string[];
  readonly closure: readonly CampaignEditClosureItem[];
  readonly lockSnapshot: DraftLockSnapshot;
  readonly manifestVersion: number;
  readonly manifestDigest: string;
}
export const planCampaignEditSchema = z
  .object({
    revision: z.number().int().min(1).max(999999),
    packageDigest: contentHashSchema,
    expectedLockVersion: z.number().int().min(0).max(1000000),
    manifestVersion: z.number().int().min(0).max(1000000),
    manifestDigest: contentHashSchema,
    instruction: z.string().trim().min(1).max(8000),
    targets: z.array(campaignEditTargetIdSchema).min(1).max(100),
  })
  .strict();
export const enqueueCampaignEditSchema = planCampaignEditSchema
  .extend({ requestId: workshopIdSchema })
  .strict();
export const retryCampaignEditSchema = z.object({ requestId: workshopIdSchema }).strict();
export type PlanCampaignEdit = z.infer<typeof planCampaignEditSchema>;
export type EnqueueCampaignEdit = z.infer<typeof enqueueCampaignEditSchema>;

export interface CampaignEditPlanConflict {
  readonly targetId: string;
  readonly label: string;
  readonly reason: 'LOCKED' | 'AMBIGUOUS' | 'MISSING';
}
export interface CampaignEditPlanView {
  readonly spec: CampaignEditSpec | null;
  readonly targets: readonly CampaignEditTarget[];
  readonly conflicts: readonly CampaignEditPlanConflict[];
}
