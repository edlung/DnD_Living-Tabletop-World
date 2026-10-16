import type {
  AssetLineageResponse,
  CommandResult,
  EntityAssetsResponse,
  EntityPresentationResponse,
  ScenePresentationResponse,
} from '@ltw/contracts';

import { SmokeFailure, campaignPath, expectStatus, type SmokeContext } from './client.ts';
import { contentHashOf } from './job.ts';
import { NORTH_GATE, TOMAS } from './preflight.ts';

/**
 * What the player sees of Tomas's new portrait (`../image-smoke.ts`), before and after the DM
 * approves it: his presentation, the North Gate scene he stands in, his assets, and the picture's
 * bytes by content hash. Before approval none of them may show it; after, all of them must.
 */
export interface PlayerView {
  readonly presentation: string | null;
  readonly scene: string | null;
  readonly listed: boolean;
  readonly contentStatus: number;
  readonly contentBytes: Uint8Array;
}

export async function playerView(context: SmokeContext, contentHash: string): Promise<PlayerView> {
  const { client } = context;
  const { presentation } = await expectStatus<EntityPresentationResponse>(
    client.get(
      'player',
      campaignPath(context, `/entities/${TOMAS}/presentation?perspective=PLAYER`),
    ),
    200,
    "player's presentation of Tomas",
  );
  const scene = await expectStatus<ScenePresentationResponse>(
    client.get(
      'player',
      campaignPath(context, `/locations/${NORTH_GATE}/scene?perspective=PLAYER`),
    ),
    200,
    "player's scene of the North Gate",
  );
  const inScene = scene.present.find((entity) => entity.entityId === TOMAS);
  if (!inScene) throw new SmokeFailure('the player does not see Tomas at the North Gate');
  const { assets } = await expectStatus<EntityAssetsResponse>(
    client.get('player', campaignPath(context, `/entities/${TOMAS}/assets?perspective=PLAYER`)),
    200,
    "player's assets of Tomas",
  );
  const content = await client.get(
    'player',
    campaignPath(context, `/assets/content/${contentHash}?perspective=PLAYER`),
  );
  return {
    presentation: presentation.image?.contentHash ?? null,
    scene: inScene.image?.contentHash ?? null,
    listed: assets.some((asset) => asset.contentHash === contentHash),
    contentStatus: content.status,
    contentBytes: content.bytes,
  };
}

export function assertHidden(view: PlayerView, contentHash: string): string {
  if (
    view.presentation === contentHash ||
    view.scene === contentHash ||
    view.listed ||
    view.contentStatus !== 404
  ) {
    throw new SmokeFailure('the player sees the portrait before the DM approved it');
  }
  return view.presentation === null
    ? 'Tomas shows no picture; the portrait is not listed; its bytes are 404'
    : `Tomas shows his earlier picture ${view.presentation}; the new one is not listed; its bytes are 404`;
}

/**
 * After approval. When Tomas has other approved pictures (a variant his state tags prefer), his
 * presentation may choose one of them; the portrait must still be listed and served.
 */
export function assertShown(view: PlayerView, contentHash: string, variants: boolean): string {
  if (!view.listed || view.contentStatus !== 200) {
    throw new SmokeFailure('the player does not get the approved portrait');
  }
  if (contentHashOf(view.contentBytes) !== contentHash) {
    throw new SmokeFailure('the player was served other bytes than the approved portrait');
  }
  if (view.presentation !== view.scene) {
    throw new SmokeFailure('the North Gate scene shows Tomas otherwise than his presentation');
  }
  if (view.presentation !== contentHash && !variants) {
    throw new SmokeFailure('Tomas is not presented with the approved portrait');
  }
  return view.presentation === contentHash
    ? 'Tomas and the North Gate scene show the portrait; its bytes are served and match'
    : `the portrait is listed and served; Tomas is presented with his variant ${String(view.presentation)}`;
}

/** The DM approves the candidate; it must become Tomas's canonical reference. */
export async function approve(context: SmokeContext, assetId: string): Promise<boolean> {
  const { client } = context;
  const result = await expectStatus<CommandResult>(
    client.post('dm', campaignPath(context, '/commands'), {
      commandId: `${context.runId}.approve`,
      command: { type: 'ApproveAsset', assetId },
    }),
    200,
    'ApproveAsset',
  );
  if (result.status === 'rejected') throw new SmokeFailure(`ApproveAsset rejected: ${result.code}`);
  const lineage = await expectStatus<AssetLineageResponse>(
    client.get('dm', campaignPath(context, '/assets')),
    200,
    'DM asset lineage',
  );
  const canonical = lineage.canonical.find((entry) => entry.entityId === TOMAS);
  if (canonical?.assetId !== assetId) {
    throw new SmokeFailure("the approved portrait is not Tomas's canonical reference");
  }
  // Other approved pictures of Tomas the presentation may prefer by his state tags.
  return lineage.assets.some(
    (asset) =>
      asset.entityId === TOMAS &&
      asset.assetId !== assetId &&
      asset.purpose === 'image' &&
      asset.variant === 'derived' &&
      (asset.status === 'APPROVED' || asset.status === 'CANONICAL'),
  );
}
