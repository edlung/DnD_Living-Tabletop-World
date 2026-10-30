import type {
  CampaignRevision,
  DraftVisualManifest,
  EntityPresentation,
  PlayerAssetView,
  ScenePresentationResponse,
} from '@ltw/contracts';
import { entityPresentationAt, type CampaignSnapshot, type ResolvedPerspective } from '@ltw/domain';

import { imageDigest, inheritVisualEntries, manifestDigest } from '../images/manifest.ts';

export interface PreviewArt {
  readonly digest: string;
  readonly byEntity: ReadonlyMap<string, ReadonlyMap<PlayerAssetView['purpose'], PlayerAssetView>>;
  readonly hashes: ReadonlySet<string>;
}

/** A selected hash is eligible only through the ordinary presentation of its subject. */
export function previewArt(
  revision: CampaignRevision,
  manifest: DraftVisualManifest | null,
  snapshot: CampaignSnapshot | null,
  perspective: ResolvedPerspective | null,
): PreviewArt {
  const byEntity = new Map<string, Map<PlayerAssetView['purpose'], PlayerAssetView>>();
  const permitted: { entityId: string; asset: PlayerAssetView }[] = [];
  if (
    manifest &&
    manifest.revision === revision.revision &&
    manifest.packageDigest === revision.digest &&
    manifestDigest(manifest) === manifest.digest &&
    snapshot &&
    perspective
  ) {
    for (const entry of inheritVisualEntries(revision, manifest.entries)) {
      if (entry.state !== 'CURRENT') continue;
      const shown = entityPresentationAt(snapshot, perspective, entry.entityId, null);
      if (!shown) continue;
      // A map is information about the ground; knowing a remote place is insufficient.
      if (entry.purpose === 'battle-map' && !shown.presentation.observed) continue;
      const asset: PlayerAssetView = {
        variant: entry.variant,
        purpose: entry.purpose,
        contentHash: entry.contentHash,
        mediaType: entry.mediaType,
      };
      const group =
        byEntity.get(entry.entityId) ?? new Map<PlayerAssetView['purpose'], PlayerAssetView>();
      group.set(entry.purpose, asset);
      byEntity.set(entry.entityId, group);
      permitted.push({ entityId: entry.entityId, asset });
    }
  }
  permitted.sort((a, b) =>
    `${a.entityId}/${a.asset.purpose}`.localeCompare(`${b.entityId}/${b.asset.purpose}`),
  );
  return {
    byEntity,
    hashes: new Set(permitted.map(({ asset }) => asset.contentHash)),
    digest: imageDigest({ revision: revision.revision, selected: permitted }),
  };
}

export function withPreviewArt(
  presentation: EntityPresentation,
  art: PreviewArt,
): EntityPresentation {
  const images = art.byEntity.get(presentation.entityId);
  return {
    ...presentation,
    image: images?.get('image') ?? null,
    figure: images?.get('figure') ?? null,
    battleMap: images?.get('battle-map') ?? null,
  };
}

export function withPreviewSceneArt(
  scene: ScenePresentationResponse | null,
  art: PreviewArt,
): ScenePresentationResponse | null {
  return scene === null
    ? null
    : {
        ...scene,
        location: withPreviewArt(scene.location, art),
        present: scene.present.map((entity) => withPreviewArt(entity, art)),
      };
}
