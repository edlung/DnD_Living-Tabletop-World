import type { WorldEngine } from '@ltw/domain';
import type { AssetContentStore } from '../assets/content-store.ts';
import { contentHashOf } from '../assets/content-store.ts';
import type { CampaignInitialContentStore } from '../campaigns/content.ts';
import { imageDigest } from '../workshop/images/manifest.ts';
import { activationInitialContent } from '../workshop/activation/content.ts';
import { activationCommandMatches, activationProvenance } from '../workshop/activation/proof.ts';
import type {
  CampaignActivationRepository,
  StoredCampaignActivation,
} from '../workshop/activation/store.ts';

export interface MemoryActivationProof {
  readonly engine: WorldEngine;
  readonly initialContent: CampaignInitialContentStore;
  readonly contents: AssetContentStore;
}
export async function memoryActivationProof(
  deps: MemoryActivationProof,
  activation: StoredCampaignActivation,
  proof: Parameters<CampaignActivationRepository['publish']>[1],
): Promise<boolean> {
  const command = (await deps.engine.commandLog(activation.campaignId)).find(
    (item) => item.commandId === activation.bootstrapCommandId,
  );
  if (!command || !activationCommandMatches(activation, command, proof)) return false;
  const snapshot = await deps.engine.load(activation.campaignId);
  const events = (snapshot?.history ?? []).filter((event) => event.sequence <= proof.version);
  if (
    (activation.status !== 'PUBLISHED' && snapshot?.state.version !== proof.version) ||
    events.length !== proof.version ||
    events[0]?.type !== 'CampaignCreated' ||
    events.at(-1)?.type !== 'CampaignBootstrapped' ||
    imageDigest(events.at(-1)?.payload) !== imageDigest(activationProvenance(activation)) ||
    events.some(
      (event) =>
        event.causation.commandId !== activation.bootstrapCommandId ||
        event.causation.commandType !== 'BootstrapCampaign' ||
        imageDigest(event.causation.actor) !==
          imageDigest({ actorId: activation.ownerId, kind: 'user' }),
    )
  )
    return false;
  const content = await deps.initialContent.get(activation.campaignId);
  if (!content || imageDigest(content) !== imageDigest(activationInitialContent(activation)))
    return false;
  for (const asset of activation.frozen.assets) {
    const bytes = await deps.contents.get(activation.campaignId, asset.contentHash);
    if (
      !bytes ||
      bytes.mediaType !== asset.mediaType ||
      contentHashOf(bytes.bytes) !== asset.contentHash
    )
      return false;
  }
  return true;
}
