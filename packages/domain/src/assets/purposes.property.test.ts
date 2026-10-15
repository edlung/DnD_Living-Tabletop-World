import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { CAMPAIGN, DM } from '../authoring/testing/world.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { DM_VIEW } from '../visual/testing/world.ts';
import { entityPresentationAt } from '../visual/views.ts';
import { SETTLED_ASSET, SHOWN_ASSET, assetIdFor } from './records.ts';
import { assetWorld } from './testing/world.ts';

/**
 * Purposes under random work (docs/adr/0035-images.md §4). From approved references of two NPCs,
 * Elowen and the Old Trade Road, random requests of variants (images, figures, battle maps, some
 * of the wrong kind), worker reports, approvals, retractions, cancellations and undos. After every
 * step the lineage is consistent and presentation shows, for each perspective, only approved
 * assets of the right purpose and audience; at the end the re-decision oracle and replay agree.
 */
const STEPS = 60;
const ENTITIES = ['mira-vale', 'orin-stonebeard', 'elowen-starwhisper', 'old-trade-road'];
const LABELS = ['night', 'rain', 'wounded', 'figure', 'map'] as const;
const PURPOSE = { figure: 'figure', map: 'battle-map' } as const;
const totals = { figures: 0, battleMaps: 0, approved: 0, refused: 0, undone: 0 };

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

  it('exercised figures, battle maps, approvals, refusals of the wrong kind, and undos', () => {
    for (const [path, count] of Object.entries(totals)) expect(count, path).toBeGreaterThan(0);
  });
});
