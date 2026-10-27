import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { CAMPAIGN, DM } from '../authoring/testing/world.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { holderPerspective, type ResolvedPerspective } from '../knowledge/perspective.ts';
import { imageFor, presentationScopeAt } from '../visual/presentation.ts';
import { DM_VIEW } from '../visual/testing/world.ts';
import { visualTimelineAt } from '../visual/timeline.ts';
import {
  assetContentAt,
  entityAssetsAt,
  entityPresentationAt,
  type Snapshot,
} from '../visual/views.ts';
import { SETTLED_ASSET, SHOWN_ASSET, assetIdFor, sameKind, type AssetRecord } from './records.ts';
import { assetWorld } from './testing/world.ts';

/**
 * Purposes under random work (docs/adr/0035-images.md §4). From approved references of two NPCs,
 * Elowen and the Old Trade Road, random requests of variants (images, figures, battle maps, some
 * of the wrong kind), worker reports, approvals, retractions, cancellations and undos. After every
 * step the lineage is consistent, each kind of picture has at most one approved (an approval
 * supersedes its kind, ADR 0035 amendment), and presentation shows, for each perspective, only
 * approved assets of the right purpose and audience, and a player is listed and served exactly what
 * presentation could choose for it (Gate 06); after every approval the approved picture is the one
 * shown for its kind; at the end the re-decision oracle and replay agree.
 */
const STEPS = 60;
const ENTITIES = ['mira-vale', 'orin-stonebeard', 'elowen-starwhisper', 'old-trade-road'];
const LABELS = ['night', 'rain', 'wounded', 'figure', 'map'] as const;
const PURPOSE = { figure: 'figure', map: 'battle-map' } as const;
const totals = { figures: 0, battleMaps: 0, approved: 0, superseded: 0, refused: 0, undone: 0 };

/** What the DM is shown of the approved asset's kind now: it must be the asset itself. */
function shownOfKind(snapshot: Snapshot, asset: AssetRecord): string | null {
  const presentation = entityPresentationAt(snapshot, DM_VIEW, asset.entityId, null)?.presentation;
  if (asset.purpose === 'figure') return presentation?.figure?.contentHash ?? null;
  if (asset.purpose === 'battle-map') return presentation?.battleMap?.contentHash ?? null;
  // An image is chosen by its label's state tags (ADR 0023 §4); the reference by none.
  const timeline = visualTimelineAt(snapshot.history, snapshot.state.clock, snapshot.state);
  const tags = asset.label === null ? [] : asset.label.split('-');
  const scope = presentationScopeAt(timeline, DM_VIEW);
  return imageFor(timeline, scope, asset.entityId, tags)?.contentHash ?? null;
}

/**
 * Gate 06 (G06-images-01): a player is listed and served only what presentation could choose for
 * it now. Presentation's picks are listed; every listed picture's bytes are served; a listed state
 * picture's label parts are all among the tags it sees; any other shown picture is a 404.
 */
function exposedAsPresented(
  snapshot: Snapshot,
  perspective: ResolvedPerspective,
  entityId: string,
  where: string,
) {
  const presented = entityPresentationAt(snapshot, perspective, entityId, null)?.presentation;
  const listed = entityAssetsAt(snapshot, perspective, entityId);
  expect(listed === null, where).toBe(presented === undefined);
  const hashes = new Set((listed ?? []).map((view) => view.contentHash));
  for (const view of [presented?.image, presented?.figure, presented?.battleMap]) {
    if (view) expect(hashes.has(view.contentHash), `${where}: presented is listed`).toBe(true);
  }
  for (const asset of snapshot.state.assets.assets.values()) {
    if (asset.entityId !== entityId || !SHOWN_ASSET.has(asset.status)) continue;
    const served = assetContentAt(snapshot, perspective, asset.contentHash, null) !== null;
    expect(served, `${where}: ${asset.assetId} served as listed`).toBe(
      hashes.has(asset.contentHash),
    );
    if (!hashes.has(asset.contentHash) || asset.purpose !== 'image' || asset.label === null) {
      continue;
    }
    for (const part of asset.label.split('-')) expect(presented?.tags, where).toContain(part);
  }
}

/**
 * The same with `at` (Gate 06 review): the bytes served for a view at T are what presentation
 * could choose for the perspective at T. Its picks at T are served at T; a picture served at T is
 * the players', of an entity visible at T, and a state picture only when its label parts are all
 * among the tags it saw then.
 */
function servedAtAsPresented(
  snapshot: Snapshot,
  perspective: ResolvedPerspective,
  entityId: string,
  at: number,
  where: string,
) {
  const presented = entityPresentationAt(snapshot, perspective, entityId, at)?.presentation;
  for (const view of [presented?.image, presented?.figure, presented?.battleMap]) {
    if (!view) continue;
    expect(assetContentAt(snapshot, perspective, view.contentHash, at), where).not.toBeNull();
  }
  for (const asset of snapshot.state.assets.assets.values()) {
    if (asset.entityId !== entityId) continue;
    if (assetContentAt(snapshot, perspective, asset.contentHash, at) === null) continue;
    expect(SHOWN_ASSET.has(asset.status) && asset.audience === 'players', where).toBe(true);
    expect(presented, `${where}: visible at T`).toBeDefined();
    if (asset.purpose !== 'image' || asset.status === 'CANONICAL' || asset.label === null) continue;
    for (const part of asset.label.split('-')) expect(presented?.tags, where).toContain(part);
  }
}

describe('purposes under random work', () => {
  it.each([3, 11, 29, 47, 83, 131])(
    'seed %i',
    async (seed) => {
      const rng = mulberry32(seed * 7_919);
      const pick = <T>(items: readonly T[]): T | undefined =>
        items.length === 0 ? undefined : items[Math.floor(rng() * items.length)];
      const world = await assetWorld();
      for (const [index, entityId] of ENTITIES.entries()) await world.approved(entityId, index + 1);
      const accepted: string[] = [];
      const track = (result: CommandResult) => {
        if (result.status === 'accepted') accepted.push(result.commandId);
        return result;
      };

      for (let step = 0; step < STEPS; step += 1) {
        const { requests, jobs, assets } = (await world.state()).assets;
        const roll = rng();
        if (roll < 0.3) {
          const label = pick(LABELS) ?? 'night';
          const result = track(
            await world.as(DM, {
              type: 'RequestAsset',
              entityId: pick(ENTITIES) ?? 'mira-vale',
              variant: 'derived',
              label,
              ...(label === 'figure' || label === 'map' ? { purpose: PURPOSE[label] } : {}),
              ...(rng() < 0.2 ? { audience: 'dm' } : {}),
            }),
          );
          if (result.status === 'rejected') totals.refused += 1;
        } else if (roll < 0.5) {
          const queued = [...requests.values()].filter(
            (request) => !request.cancelled && !jobs.has(request.requestId),
          );
          const target = pick(queued);
          if (target) track(await world.start(target.requestId));
        } else if (roll < 0.68) {
          const running = [...jobs.values()].filter((job) => job.status === 'STARTED');
          const target = pick(running);
          if (target) {
            track(
              rng() < 0.85
                ? await world.complete(target.requestId, 1_000 + Math.floor(rng() * 1_000_000))
                : await world.fail(target.requestId),
            );
          }
        } else if (roll < 0.82) {
          const target = pick([...assets.values()].filter((asset) => asset.status === 'CANDIDATE'));
          if (target && track(await world.approve(target.assetId)).status === 'accepted') {
            totals.approved += 1;
            const after = await world.engine.load(CAMPAIGN);
            if (!after) throw new Error('missing campaign');
            // The picture approved last is the one shown for its kind, made before or after.
            expect(shownOfKind(after, target), `approved ${target.assetId}`).toBe(
              target.contentHash,
            );
            const replaced = [...assets.values()].filter(
              (asset) =>
                asset.status === 'APPROVED' &&
                asset.variant === 'derived' &&
                sameKind(asset, target) &&
                after.state.assets.assets.get(asset.assetId)?.status === 'SUPERSEDED',
            );
            totals.superseded += replaced.length;
          }
        } else if (roll < 0.88) {
          const target = pick([...assets.values()].filter((a) => !SETTLED_ASSET.has(a.status)));
          if (target) track(await world.retract(target.assetId));
        } else if (roll < 0.92) {
          const target = pick([...requests.keys()].filter((id) => !jobs.has(id)));
          if (target) track(await world.cancel(target));
        } else {
          const target = pick(accepted.slice(-6));
          if (target && (await world.undo(target)).status === 'accepted') totals.undone += 1;
        }

        const snapshot = await world.engine.load(CAMPAIGN);
        if (!snapshot) throw new Error('missing campaign');
        const { state } = snapshot;
        expect(checkWorldIntegrity(state), `step ${String(step)}`).toEqual([]);
        const shown = [...state.assets.assets.values()].filter((asset) =>
          SHOWN_ASSET.has(asset.status),
        );
        for (const asset of shown) {
          expect(
            shown.filter((other) => sameKind(other, asset)).map((other) => other.assetId),
            `step ${String(step)}: one approved picture of a kind`,
          ).toEqual([asset.assetId]);
        }
        const elowen = holderPerspective(state, {
          kind: 'CHARACTER',
          characterId: 'elowen-starwhisper',
        });
        for (const entityId of ENTITIES) {
          for (const perspective of [DM_VIEW, elowen]) {
            const shown = entityPresentationAt(snapshot, perspective, entityId, null)?.presentation;
            const kind = state.entities.get(entityId)?.kind;
            for (const [field, purpose] of [
              ['image', 'image'],
              ['figure', 'figure'],
              ['battleMap', 'battle-map'],
            ] as const) {
              const view = shown?.[field] ?? null;
              if (view === null) continue;
              expect(view.purpose, `${entityId} ${field}`).toBe(purpose);
              const asset = [...state.assets.assets.values()].find(
                (candidate) =>
                  candidate.entityId === entityId && candidate.contentHash === view.contentHash,
              );
              expect(asset !== undefined && SHOWN_ASSET.has(asset.status)).toBe(true);
              if (perspective !== DM_VIEW) expect(asset?.audience).toBe('players');
            }
            if (kind === 'location') expect(shown?.figure ?? null).toBeNull();
            else expect(shown?.battleMap ?? null).toBeNull();
          }
          exposedAsPresented(snapshot, elowen, entityId, `step ${String(step)} ${entityId}`);
          // A past view half a day earlier: another day phase, for Elowen and the party.
          const earlier = Math.max(0, state.clock - 12 * 3_600);
          for (const perspective of [elowen, holderPerspective(state, { kind: 'PARTY' })]) {
            servedAtAsPresented(
              snapshot,
              perspective,
              entityId,
              earlier,
              `step ${String(step)} ${entityId} at ${String(earlier)}`,
            );
          }
        }
      }
      await world.verified();
      const final = [...(await world.state()).assets.assets.values()];
      totals.figures += final.filter((asset) => asset.purpose === 'figure').length;
      totals.battleMaps += final.filter((asset) => asset.purpose === 'battle-map').length;
      expect(final.every((asset) => asset.assetId === assetIdFor(asset.requestId))).toBe(true);
    },
    60_000,
  );

  it('exercised figures, battle maps, approvals, supersessions, refusals of the wrong kind, and undos', () => {
    for (const [path, count] of Object.entries(totals)) expect(count, path).toBeGreaterThan(0);
  });
});
