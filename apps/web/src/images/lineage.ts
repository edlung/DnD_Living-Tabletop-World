import type {
  AssetAudience,
  AssetLineageResponse,
  AssetPurpose,
  AssetRequestView,
  AssetVariant,
  AssetView,
  EntityKind,
  KernelCommandOf,
} from '@ltw/contracts';

/**
 * The DM's view of an entity's pictures (docs/STAGE_330_DESIGN.md "DM controls"; ADR 0022, ADR
 * 0035 §4), read from the DM's lineage (`GET …/assets`) alone: what is approved now, what waits
 * for the DM's decision, what the image generator is working on, and what failed. Nothing here
 * decides who sees a picture — the server's presentation does. Approving a picture supersedes
 * the approved one of its kind (ADR 0035 amendment), so each kind has one approved picture;
 * "approved now" mirrors the presentation's rule for an earlier writer's history that left
 * several (the canonical picture, and the newest approved picture of each kind), so the DM is
 * never shown a superseded picture as current.
 */

/** What a picture or a request is: its variant, its purpose and, for a derived image, its label. */
export interface ImageKind {
  readonly variant: AssetVariant;
  readonly purpose: AssetPurpose;
  readonly label: string | null;
}

/**
 * Pictures of one kind replace each other, as the server's `sameKind` has it: a derived image per
 * label (the presentation chooses it by its label's state tags), a figure or a battle map per
 * purpose whatever its label. Approving one supersedes the approved one of its kind.
 */
export const kindKey = (kind: ImageKind): string =>
  kind.purpose === 'image' ? `${kind.variant}:${kind.label ?? ''}` : kind.purpose;

export interface ShownImage {
  readonly asset: AssetView;
  /** The request that made it, with the DM's note and its source; null if an undo removed it. */
  readonly request: AssetRequestView | null;
}

export interface EntityImages {
  /** Approved now: the canonical picture first, then the newest approved picture of each kind. */
  readonly approved: readonly ShownImage[];
  /** Made and waiting for the DM: approve, discard or generate again. */
  readonly candidates: readonly ShownImage[];
  /** Requests the image generator has not answered yet: waiting, or being generated. */
  readonly working: readonly AssetRequestView[];
  /** Requests that made no picture, unless a later request of the same kind followed. */
  readonly failed: readonly AssetRequestView[];
  /** Whether a canonical picture exists: every variant, figure and battle map derives from it. */
  readonly canonical: boolean;
}

const ORDER: Readonly<Record<AssetPurpose, number>> = { image: 0, figure: 1, 'battle-map': 2 };

export function entityImages(lineage: AssetLineageResponse, entityId: string): EntityImages {
  const requestOf = (requestId: string) =>
    lineage.requests.find((request) => request.requestId === requestId) ?? null;
  let canonical: AssetView | null = null;
  // The lineage lists assets as they were made: a later one of a kind is the newer.
  const newest = new Map<string, AssetView>();
  const candidates: ShownImage[] = [];
  for (const asset of lineage.assets) {
    if (asset.entityId !== entityId) continue;
    if (asset.status === 'CANONICAL') canonical = asset;
    else if (asset.status === 'APPROVED') newest.set(kindKey(asset), asset);
    else if (asset.status === 'CANDIDATE') {
      candidates.push({ asset, request: requestOf(asset.requestId) });
    }
  }
  const derived = [...newest.values()].sort(
    (a, b) => ORDER[a.purpose] - ORDER[b.purpose] || (a.label ?? '').localeCompare(b.label ?? ''),
  );
  // Requests are listed in the order they were made.
  const requests = lineage.requests.filter((request) => request.entityId === entityId);
  return {
    approved: [...(canonical ? [canonical] : []), ...derived].map((asset) => ({
      asset,
      request: requestOf(asset.requestId),
    })),
    candidates,
    working: requests.filter(
      (request) => request.status === 'QUEUED' || request.status === 'STARTED',
    ),
    failed: requests.filter(
      (request, index) =>
        request.status === 'FAILED' &&
        !requests.slice(index + 1).some((later) => kindKey(later) === kindKey(request)),
    ),
    canonical: canonical !== null,
  };
}

/**
 * What players see of a picture the DM just approved, read from the lineage after the approval
 * (never assumed): not the picture shown for its kind (it changed meanwhile); the DM's alone; the
 * main picture (and whether approved state pictures take its place in their states); the figure;
 * the battle map; or a state picture (and whether other approved state pictures may fit too).
 */
export type ApprovalStanding =
  | { readonly kind: 'not-shown' }
  | { readonly kind: 'dm-only' }
  | { readonly kind: 'main'; readonly states: boolean }
  | { readonly kind: 'figure' }
  | { readonly kind: 'battle-map' }
  | { readonly kind: 'state'; readonly label: string; readonly others: boolean };

export function approvalStanding(lineage: AssetLineageResponse, assetId: string): ApprovalStanding {
  const asset = lineage.assets.find((shown) => shown.assetId === assetId);
  if (!asset) return { kind: 'not-shown' };
  const { approved } = entityImages(lineage, asset.entityId);
  if (!approved.some(({ asset: shown }) => shown.assetId === assetId)) return { kind: 'not-shown' };
  if (asset.audience === 'dm') return { kind: 'dm-only' };
  if (asset.purpose === 'figure' || asset.purpose === 'battle-map') return { kind: asset.purpose };
  const states = approved.filter(
    ({ asset: shown }) =>
      shown.purpose === 'image' && shown.variant === 'derived' && shown.audience === 'players',
  );
  return asset.variant === 'reference'
    ? { kind: 'main', states: states.length > 0 }
    : {
        kind: 'state',
        label: asset.label ?? '',
        others: states.some(({ asset: shown }) => shown.assetId !== assetId),
      };
}

export interface EntityWork {
  readonly entityId: string;
  readonly images: EntityImages;
}

/** Every entity with something for the DM: candidates, requests in progress, failures. */
export function pendingWork(lineage: AssetLineageResponse): EntityWork[] {
  const order: string[] = [];
  const note = (entityId: string) => {
    if (!order.includes(entityId)) order.push(entityId);
  };
  for (const asset of lineage.assets) if (asset.status === 'CANDIDATE') note(asset.entityId);
  for (const request of lineage.requests) {
    if (['QUEUED', 'STARTED', 'FAILED'].includes(request.status)) note(request.entityId);
  }
  return order
    .map((entityId) => ({ entityId, images: entityImages(lineage, entityId) }))
    .filter(
      ({ images }) => images.candidates.length + images.working.length + images.failed.length > 0,
    );
}

/** What the DM may ask the image generator for. */
export type RequestChoice = 'reference' | 'variant' | 'figure' | 'battle-map';

/**
 * States a derived image can be chosen for (ADR 0023 §4: a variant shows when every part of its
 * label is among the tags the perspective sees): a place by its time of day and weather, a
 * person or creature by its condition, a thing by whether it still stands.
 */
export const STATES: Readonly<Record<EntityKind, readonly string[]>> = {
  location: ['night', 'dawn', 'dusk', 'rain', 'storm', 'fog', 'snow', 'overcast', 'night-rain'],
  character: ['wounded', 'unconscious', 'dead', 'night'],
  npc: ['wounded', 'unconscious', 'dead', 'night'],
  creature: ['wounded', 'unconscious', 'dead', 'night'],
  item: ['destroyed', 'night'],
  feature: ['destroyed', 'night'],
  faction: [],
};

/** The choices the design allows for a kind of entity (ADR 0035 §4: who has a figure or a map). */
export function choicesFor(kind: EntityKind): readonly RequestChoice[] {
  return [
    'reference',
    ...(STATES[kind].length > 0 ? (['variant'] as const) : []),
    ...(kind === 'character' || kind === 'npc' || kind === 'creature' ? (['figure'] as const) : []),
    ...(kind === 'location' ? (['battle-map'] as const) : []),
  ];
}

/** The labels the curated set gives a figure and a battle map; any label would do. */
const PURPOSE_LABELS = { figure: 'figure', 'battle-map': 'map' } as const;

/** The kind of picture a choice asks for. A variant, figure or map derives from the canonical. */
export function kindOfChoice(choice: RequestChoice, state: string): ImageKind {
  switch (choice) {
    case 'reference':
      return { variant: 'reference', purpose: 'image', label: null };
    case 'variant':
      return { variant: 'derived', purpose: 'image', label: state };
    case 'figure':
    case 'battle-map':
      return { variant: 'derived', purpose: choice, label: PURPOSE_LABELS[choice] };
  }
}

/** The choice that asks for another picture of this kind (Replace). */
export function choiceOfKind(kind: ImageKind): {
  readonly choice: RequestChoice;
  readonly state: string | null;
} {
  if (kind.purpose === 'figure' || kind.purpose === 'battle-map') {
    return { choice: kind.purpose, state: null };
  }
  return kind.variant === 'reference'
    ? { choice: 'reference', state: null }
    : { choice: 'variant', state: kind.label };
}

export type ImageCommand = KernelCommandOf<
  'RequestAsset' | 'ApproveAsset' | 'RetractAsset' | 'AlignBattleMap'
>;

/** `RequestAsset` as the DM sends it: a purpose only when not an image, a note only when typed. */
export function requestCommand(
  entityId: string,
  kind: ImageKind,
  audience: AssetAudience,
  note: string | null,
): KernelCommandOf<'RequestAsset'> {
  const typed = note?.trim() ?? '';
  return {
    type: 'RequestAsset',
    entityId,
    variant: kind.variant,
    ...(kind.label === null ? {} : { label: kind.label }),
    ...(kind.purpose === 'image' ? {} : { purpose: kind.purpose }),
    audience,
    ...(typed === '' ? {} : { note: typed }),
  };
}

/**
 * The same request once more (Generate again, Try again): its kind, audience and the note the DM
 * typed for it, if any. A picture whose request an undo removed repeats without a note.
 */
export function repeatCommand(
  source: AssetRequestView | AssetView,
  request: AssetRequestView | null,
): KernelCommandOf<'RequestAsset'> {
  return requestCommand(source.entityId, source, source.audience, request?.note ?? null);
}
