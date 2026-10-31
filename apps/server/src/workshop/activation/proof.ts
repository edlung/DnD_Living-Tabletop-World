import { bootstrapCampaignCommandSchema, type BootstrapCampaignCommand } from '@ltw/contracts';
import { commandSubmissionSchema, fingerprintOf } from '@ltw/domain';

import { imageDigest } from '../images/manifest.ts';
import type { StoredCampaignActivation } from './store.ts';

export function activationBootstrapCommand(
  activation: StoredCampaignActivation,
): BootstrapCampaignCommand {
  const frozen = activation.frozen;
  return {
    type: 'BootstrapCampaign',
    content: frozen.revision.content,
    identities: frozen.revision.identities,
    source: {
      activationId: activation.activationId,
      ownerId: activation.ownerId,
      draftId: activation.draftId,
      revision: frozen.revision.revision,
      packageDigest: frozen.revision.digest,
      planDigest: frozen.planDigest,
      visualManifestDigest: frozen.manifest.digest,
      scenarioDigest: frozen.scenarioDigest,
      questDigest: frozen.questDigest,
      lockDigest: frozen.lockDigest,
    },
    visualMode: frozen.textOnly ? 'TEXT_ONLY' : 'CHOSEN',
    selectedAssets: [...frozen.assets],
    confirmation: {
      packageDigest: frozen.revision.digest,
      planDigest: frozen.planDigest,
      visualManifestDigest: frozen.manifest.digest,
      reviewDigest: frozen.reviewDigest,
      acknowledgedFindingIds: [...frozen.acknowledgedFindingIds],
    },
  };
}
export interface ActivationCommandRecord {
  readonly commandId: string;
  readonly campaignId: string;
  readonly commandType: string;
  readonly actor: unknown;
  readonly fingerprint: string;
  readonly command: unknown;
  readonly reason: string | null;
  readonly firstSequence: number;
  readonly lastSequence: number;
}
export function activationCommandMatches(
  activation: StoredCampaignActivation,
  record: ActivationCommandRecord,
  proof: { readonly fingerprint: string; readonly version: number },
): boolean {
  if (
    !Number.isInteger(proof.version) ||
    proof.version < 1 ||
    record.commandType !== 'BootstrapCampaign' ||
    record.commandId !== activation.bootstrapCommandId ||
    record.campaignId !== activation.campaignId ||
    record.fingerprint !== proof.fingerprint ||
    record.firstSequence !== 1 ||
    record.lastSequence !== proof.version ||
    imageDigest(record.actor) !== imageDigest({ actorId: activation.ownerId, kind: 'user' })
  )
    return false;
  const command = bootstrapCampaignCommandSchema.safeParse(record.command);
  if (!command.success) return false;
  let raw: unknown;
  try {
    raw = JSON.parse(record.fingerprint);
  } catch {
    return false;
  }
  const submission = commandSubmissionSchema.safeParse(raw);
  return (
    submission.success &&
    fingerprintOf(submission.data) === proof.fingerprint &&
    submission.data.commandId === activation.bootstrapCommandId &&
    submission.data.campaignId === activation.campaignId &&
    imageDigest(submission.data.actor) === imageDigest(record.actor) &&
    imageDigest(submission.data.command) === imageDigest(command.data) &&
    (submission.data.reason ?? null) === record.reason &&
    imageDigest(command.data) === imageDigest(activationBootstrapCommand(activation))
  );
}
export function activationProvenance(activation: StoredCampaignActivation) {
  const command = activationBootstrapCommand(activation);
  return {
    source: command.source,
    visualMode: command.visualMode,
    confirmation: command.confirmation,
  };
}
