import type pg from 'pg';

import { readInitialContent } from '../../campaigns/postgres-content.ts';
import { imageDigest } from '../images/manifest.ts';
import { activationInitialContent } from './content.ts';
import { activeActivationLease, loadActivation, operationKeys } from './postgres-common.ts';
import type {
  ActivationLease,
  CampaignActivationRepository,
  StoredCampaignActivation,
} from './store.ts';
import { activationCommandMatches, activationProvenance } from './proof.ts';

async function publicationProof(
  client: pg.PoolClient,
  activation: StoredCampaignActivation,
  proof: Parameters<CampaignActivationRepository['publish']>[1],
): Promise<boolean> {
  if (!Number.isInteger(proof.version) || proof.version < 1) return false;
  const row = (
    await client.query<{
      command_id: string;
      stream_id: string;
      command_type: string;
      actor: unknown;
      fingerprint: string;
      command: unknown;
      first_sequence: string;
      last_sequence: string;
      version: string;
      reason: string | null;
    }>(
      `SELECT c.*,s.version
    FROM ltw_commands c JOIN ltw_event_streams s ON s.stream_id=c.stream_id
    WHERE c.command_id=$1 AND c.stream_id=$2`,
      [activation.bootstrapCommandId, activation.campaignId],
    )
  ).rows[0];
  if (
    !row ||
    (activation.status !== 'PUBLISHED' && Number(row.version) !== proof.version) ||
    !activationCommandMatches(
      activation,
      {
        commandId: row.command_id,
        campaignId: row.stream_id,
        commandType: row.command_type,
        actor: row.actor,
        fingerprint: row.fingerprint,
        command: row.command,
        reason: row.reason,
        firstSequence: Number(row.first_sequence),
        lastSequence: Number(row.last_sequence),
      },
      proof,
    )
  )
    return false;
  const frozen = activation.frozen;
  const markers = (
    await client.query<{ sequence: string; event_type: string; payload: unknown }>(
      `SELECT sequence,event_type,payload
    FROM ltw_events WHERE stream_id=$1 AND sequence IN (1,$2::bigint) ORDER BY sequence`,
      [activation.campaignId, proof.version],
    )
  ).rows;
  if (
    markers[0]?.event_type !== 'CampaignCreated' ||
    markers.at(-1)?.event_type !== 'CampaignBootstrapped' ||
    imageDigest(markers.at(-1)?.payload) !== imageDigest(activationProvenance(activation))
  )
    return false;
  const events = (
    await client.query<{ n: number; matching: number }>(
      `SELECT count(*)::int n,
    count(*) FILTER(WHERE command_id=$2 AND command_type='BootstrapCampaign' AND actor=$3::jsonb)::int matching
    FROM ltw_events WHERE stream_id=$1 AND sequence<=$4::bigint`,
      [
        activation.campaignId,
        activation.bootstrapCommandId,
        JSON.stringify(row.actor),
        proof.version,
      ],
    )
  ).rows[0];
  if (events?.n !== proof.version || events.matching !== proof.version) return false;
  const content = await readInitialContent(client, activation.campaignId);
  if (!content || imageDigest(content) !== imageDigest(activationInitialContent(activation)))
    return false;
  if (frozen.assets.length) {
    const contents = (
      await client.query<{ content_hash: string; media_type: string }>(
        `SELECT content_hash,media_type FROM ltw_asset_contents
      WHERE campaign_id=$1 AND content_hash=ANY($2::text[])`,
        [activation.campaignId, frozen.assets.map((asset) => asset.contentHash)],
      )
    ).rows;
    const byHash = new Map(contents.map((item) => [item.content_hash, item.media_type]));
    if (frozen.assets.some((asset) => byHash.get(asset.contentHash) !== asset.mediaType))
      return false;
  }
  return true;
}
export async function publishActivation(
  client: pg.PoolClient,
  lease: ActivationLease,
  proof: Parameters<CampaignActivationRepository['publish']>[1],
): Promise<boolean> {
  const activation = await loadActivation(client, lease, true);
  if (
    !activation ||
    activation.activationId !== lease.activationId ||
    activation.fence !== lease.fence ||
    activation.workerId !== lease.workerId
  )
    return false;
  if (
    activation.status !== 'PUBLISHED' &&
    (!(await activeActivationLease(client, lease)) || activation.phase !== 'BOOTSTRAPPED')
  )
    return false;
  if (!(await publicationProof(client, activation, proof))) return false;
  if (activation.status === 'PUBLISHED') return true;
  if (!(await activeActivationLease(client, lease))) return false;
  return (
    (
      await client.query(
        `UPDATE ltw_workshop_campaign_activations SET status='PUBLISHED',phase='PUBLISHED',
    published_at=clock_timestamp(),updated_at=clock_timestamp(),lease_until=NULL,next_attempt_at=NULL,failure_code=NULL,retryable=false
    WHERE owner_id=$1 AND draft_id=$2 AND activation_id=$3 AND lease_until>clock_timestamp()
    AND status='PROVISIONING'`,
        operationKeys(lease),
      )
    ).rowCount === 1
  );
}
