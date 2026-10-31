import { randomUUID } from 'node:crypto';
import { startCampaignActivationSchema } from '@ltw/contracts';
import type pg from 'pg';

import { imageDigest } from '../images/manifest.ts';
import { ensureManifest } from '../images/postgres-manifests.ts';
import {
  controlDraftLock,
  controlHead,
  currentControlSession,
  ensureDraftLocks,
} from '../revisions/postgres-helpers.ts';
import { frozenActivationDigestsValid } from './digests.ts';
import {
  activationRequestFingerprint,
  frozenCampaignActivationSchema,
  sameRevision,
  storedActivation,
  type ActivationRow,
} from './content.ts';
import { loadActivation } from './postgres-common.ts';
import type { CampaignActivationRepository } from './store.ts';

export async function beginActivation(
  client: pg.PoolClient,
  input: Parameters<CampaignActivationRepository['begin']>[0],
): ReturnType<CampaignActivationRepository['begin']> {
  const request = startCampaignActivationSchema.parse(input.request);
  if (!(await controlDraftLock(client, input))) return { kind: 'not-found' };
  if (!(await currentControlSession(client, input.ownerId, input.authSessionId)))
    return { kind: 'conflict', reason: 'STALE_REVIEW' };
  const prior = await loadActivation(client, input, true),
    fingerprint = activationRequestFingerprint(request);
  if (prior)
    return prior.requestId !== request.requestId
      ? { kind: 'conflict', reason: 'ALREADY_ACTIVATED' }
      : prior.requestFingerprint !== fingerprint
        ? { kind: 'conflict', reason: 'REQUEST_REUSED' }
        : { kind: 'saved', activation: prior };
  const head = await controlHead(client, input);
  if (!head) return { kind: 'not-found' };
  if (head.revision !== request.revision || head.digest !== request.packageDigest)
    return { kind: 'conflict', reason: 'STALE_REVISION' };
  const locks = await ensureDraftLocks(client, input, head);
  if (locks.version !== request.expectedLockVersion || locks.digest !== request.lockDigest)
    return { kind: 'conflict', reason: 'STALE_LOCKS' };
  const manifest = await ensureManifest(client, input, head);
  if (manifest.version !== request.manifestVersion || manifest.digest !== request.manifestDigest)
    return { kind: 'conflict', reason: 'STALE_MANIFEST' };
  const parsedFrozen = frozenCampaignActivationSchema.safeParse(input.frozen);
  if (!parsedFrozen.success) return { kind: 'conflict', reason: 'NOT_READY' };
  const frozen = parsedFrozen.data;
  const acknowledged = [...new Set(request.acknowledgedFindingIds)].sort(),
    required = [...new Set(frozen.requiredFindingIds)].sort();
  if (
    acknowledged.length !== request.acknowledgedFindingIds.length ||
    imageDigest(acknowledged) !== imageDigest(required) ||
    imageDigest(acknowledged) !== imageDigest([...new Set(frozen.acknowledgedFindingIds)].sort()) ||
    required.some((id) => !frozen.findingIds.includes(id))
  )
    return { kind: 'conflict', reason: 'ACKNOWLEDGEMENTS' };
  if (
    !sameRevision(head, frozen.revision) ||
    frozen.lockVersion !== locks.version ||
    frozen.lockDigest !== locks.digest ||
    imageDigest(frozen.manifest) !== imageDigest(manifest) ||
    request.reviewDigest !== frozen.reviewDigest ||
    request.planDigest !== frozen.planDigest ||
    request.textOnly !== frozen.textOnly ||
    !frozenActivationDigestsValid(input, frozen)
  )
    return { kind: 'conflict', reason: 'STALE_REVIEW' };
  const activationId = randomUUID(),
    campaignId = randomUUID();
  const row = (
    await client.query<ActivationRow>(
      `INSERT INTO ltw_workshop_campaign_activations
    (activation_id,owner_id,draft_id,campaign_id,bootstrap_command_id,auth_session_id,request_id,request_fingerprint,
    revision,package_digest,plan_digest,manifest_digest,text_only,title,language,frozen,frozen_digest,created_at,updated_at,next_attempt_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,clock_timestamp(),clock_timestamp(),clock_timestamp()) RETURNING *`,
      [
        activationId,
        input.ownerId,
        input.draftId,
        campaignId,
        `activation:${activationId}`,
        input.authSessionId,
        request.requestId,
        fingerprint,
        head.revision,
        head.digest,
        frozen.planDigest,
        manifest.digest,
        frozen.textOnly,
        head.content.world.name,
        head.content.world.language,
        JSON.stringify(frozen),
        imageDigest(frozen),
      ],
    )
  ).rows[0];
  if (!row) throw new Error('ACTIVATION_NOT_STORED');
  return { kind: 'saved', activation: storedActivation(row) };
}
