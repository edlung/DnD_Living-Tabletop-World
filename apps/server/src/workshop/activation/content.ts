import {
  bootstrapCampaignCommandSchema,
  bootstrapCampaignAssetSchema,
  campaignActivationViewSchema,
  campaignPackageSchema,
  campaignQuestIdentitiesShape,
  contentHashSchema,
  questBookSchema,
  workshopIdSchema,
  type StartCampaignActivation,
  type CampaignRevision,
} from '@ltw/contracts';
import { z } from 'zod';

import { imageDigest } from '../images/manifest.ts';
import { manifestView } from '../images/postgres-manifests.ts';
import { campaignContentDigest, parseStoredCampaignSource } from '../packages/content.ts';
import type { FrozenCampaignActivation, StoredCampaignActivation } from './store.ts';
import type { CampaignInitialContent } from '../../campaigns/content.ts';

export const activationRequestFingerprint = (request: StartCampaignActivation): string =>
  imageDigest(Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'requestId')));
export const activationRevisionSchema = z
  .object({
    draftId: workshopIdSchema,
    revision: z.number().int().min(1).max(1000000),
    basedOnRevision: z.number().int().min(0).max(999999),
    content: campaignPackageSchema,
    identities: bootstrapCampaignCommandSchema.shape.identities.extend(
      campaignQuestIdentitiesShape,
    ),
    digest: contentHashSchema,
    source: z.unknown().transform(parseStoredCampaignSource),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.revision !== value.basedOnRevision + 1 ||
      value.digest !== campaignContentDigest(value.content, value.identities)
    )
      context.addIssue({ code: 'custom', message: 'Invalid immutable revision' });
  });
const manifestSchema = z
  .object({
    revision: z.number().int().positive(),
    version: z.number().int().min(0),
    packageDigest: contentHashSchema,
    digest: contentHashSchema,
    entries: z.array(z.unknown()).max(1000),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .transform((value) =>
    manifestView({
      revision: value.revision,
      version: value.version,
      package_digest: value.packageDigest,
      digest: value.digest,
      entries: value.entries,
      created_at: new Date(value.createdAt),
      request_fingerprint: null,
    }),
  );
export const frozenCampaignActivationSchema = z
  .object({
    revision: activationRevisionSchema,
    manifest: manifestSchema,
    lockVersion: z.number().int().min(0).max(1000000),
    lockDigest: contentHashSchema,
    planDigest: contentHashSchema,
    scenarioDigest: contentHashSchema,
    questDigest: contentHashSchema,
    reviewDigest: contentHashSchema,
    textOnly: z.boolean(),
    readiness: z.literal('READY'),
    findingIds: z.array(contentHashSchema).max(10000),
    requiredFindingIds: z.array(contentHashSchema).max(500),
    acknowledgedFindingIds: z.array(contentHashSchema).max(500),
    assets: z.array(bootstrapCampaignAssetSchema).max(1000),
    quests: questBookSchema.shape.quests,
  })
  .strict();
export function checkedFrozen(value: unknown): FrozenCampaignActivation {
  return frozenCampaignActivationSchema.parse(value);
}
export interface ActivationRow {
  activation_id: string;
  owner_id: string;
  draft_id: string;
  campaign_id: string;
  bootstrap_command_id: string;
  auth_session_id: string;
  request_id: string;
  request_fingerprint: string;
  revision: number;
  package_digest: string;
  plan_digest: string;
  manifest_digest: string;
  text_only: boolean;
  title: string;
  language: 'en' | 'ru';
  frozen: unknown;
  frozen_digest: string;
  status: 'PROVISIONING' | 'PUBLISHED';
  phase: 'RESERVED' | 'CONTENT_READY' | 'BOOTSTRAPPED' | 'PUBLISHED';
  failure_code: string | null;
  retryable: boolean;
  fence: string;
  worker_id: string | null;
  lease_until: Date | null;
  next_attempt_at: Date | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
}
export const ACTIVATION_PUBLIC_COLUMNS =
  'activation_id,draft_id,campaign_id,revision,package_digest,plan_digest,manifest_digest,text_only,status,phase,failure_code,retryable,created_at,updated_at,published_at';
export type PublicActivationRow = Pick<
  ActivationRow,
  | 'activation_id'
  | 'draft_id'
  | 'campaign_id'
  | 'revision'
  | 'package_digest'
  | 'plan_digest'
  | 'manifest_digest'
  | 'text_only'
  | 'status'
  | 'phase'
  | 'failure_code'
  | 'retryable'
  | 'created_at'
  | 'updated_at'
  | 'published_at'
>;
export function activationView(row: PublicActivationRow) {
  return campaignActivationViewSchema.parse({
    activationId: row.activation_id,
    draftId: row.draft_id,
    campaignId: row.campaign_id,
    revision: row.revision,
    packageDigest: row.package_digest,
    planDigest: row.plan_digest,
    manifestDigest: row.manifest_digest,
    textOnly: row.text_only,
    status: row.status,
    phase: row.phase,
    failureCode: row.failure_code,
    retryable: row.retryable,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    publishedAt: row.published_at?.toISOString() ?? null,
  });
}
export function storedActivation(row: ActivationRow): StoredCampaignActivation {
  const frozen = checkedFrozen(row.frozen);
  if (
    imageDigest(frozen) !== row.frozen_digest ||
    frozen.revision.draftId !== row.draft_id ||
    frozen.revision.revision !== row.revision ||
    frozen.revision.digest !== row.package_digest ||
    frozen.planDigest !== row.plan_digest ||
    frozen.manifest.digest !== row.manifest_digest ||
    frozen.textOnly !== row.text_only ||
    (frozen.revision.source.kind === 'OWNER' && frozen.revision.source.actorId !== row.owner_id)
  )
    throw new Error('CORRUPT_ACTIVATION');
  const view = activationView(row);
  return {
    ...view,
    ownerId: row.owner_id,
    authSessionId: row.auth_session_id,
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
    bootstrapCommandId: row.bootstrap_command_id,
    frozen,
    fence: row.fence,
    workerId: row.worker_id,
    leaseUntil: row.lease_until?.toISOString() ?? null,
    nextAttemptAt: row.next_attempt_at?.toISOString() ?? null,
  };
}
export function activationInitialContent(
  activation: StoredCampaignActivation,
): CampaignInitialContent {
  const frozen = activation.frozen;
  return {
    campaignId: activation.campaignId,
    activationId: activation.activationId,
    scenario: frozen.revision,
    quests: frozen.quests,
    assets: frozen.assets,
    scenarioDigest: frozen.scenarioDigest,
    questDigest: frozen.questDigest,
    manifestDigest: frozen.manifest.digest,
    planDigest: frozen.planDigest,
  };
}
export function sameRevision(a: CampaignRevision, b: CampaignRevision) {
  return imageDigest(a) === imageDigest(b);
}
