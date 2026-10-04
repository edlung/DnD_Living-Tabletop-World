import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { DM, confirm, tomas } from '../authoring/testing/world.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { assetIdFor, SETTLED_ASSET } from './records.ts';
import { assetWorld, codeOf } from './testing/world.ts';

/**
 * Random interleavings of authoring commits, asset requests, worker
 * reports, DM decisions, and undos. After every step the state is
 * consistent, and no running job or standing image depicts an entity an
 * undo removed (ADR 0006 §9). At the end, the re-decision oracle and replay
 * from stored JSON agree with the canonical state.
 */
const STEPS = 45;
const totals = { undone: 0, held: 0, discarded: 0, settledThenUndone: 0, orphanedLineage: 0 };

describe('asset work under random undo', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'seed %i',
    async (seed) => {
      const rng = mulberry32(seed * 104_729);
      const pick = <T>(items: readonly T[]): T | undefined =>
        items.length === 0 ? undefined : items[Math.floor(rng() * items.length)];
      const world = await assetWorld();
      const accepted: string[] = [];
      const counts = { undone: 0, held: 0, discarded: 0, settledThenUndone: 0 };
      let npcs = 0;

      const track = (result: CommandResult) => {
        if (result.status === 'accepted') accepted.push(result.commandId);
        return result;
      };

      for (let step = 0; step < STEPS; step += 1) {
        const state = await world.state();
        const { requests, jobs, assets } = state.assets;
        const entities = [
          'mira-vale',
          'orin-stonebeard',
          ...[...state.entities.keys()].filter((id) => id.startsWith('npc-')),
        ];
        const roll = rng();
        if (roll < 0.12) {
          npcs += 1;
          const result = await world.commit(
            [
              tomas({
                entityId: `npc-${String(seed)}-${String(npcs)}`,
                name: `Stranger ${String(npcs)}`,
              }),
            ],
            { confirmation: confirm('L2') },
          );
          track(result);
        } else if (roll < 0.25) {
          const entityId = pick(entities) ?? 'mira-vale';
          const derived = state.assets.canonical.has(entityId) && rng() < 0.5;
          track(
            await world.as(DM, {
              type: 'RequestAsset',
              entityId,
              variant: derived ? 'derived' : 'reference',
              ...(derived ? { label: pick(['night', 'wounded']) } : {}),
              ...(rng() < 0.2 ? { audience: 'dm' } : {}),
            }),
          );
        } else if (roll < 0.4) {
          const queued = [...requests.values()].filter(
            (r) => !r.cancelled && !jobs.has(r.requestId),
          );
          const target = pick(queued);
          if (target) track(await world.start(target.requestId));
        } else if (roll < 0.55) {
          const running = [...jobs.values()].filter(
            (j) =>
              j.status === 'STARTED' ||
              (j.status === 'CANCELLED' &&
                !assets.has(assetIdFor(j.requestId)) &&
                j.failure === null),
          );
          const target = pick(running);
          if (target) {
            const result = track(
              rng() < 0.8
                ? await world.complete(target.requestId, Math.floor(rng() * 1_000_000))
                : await world.fail(target.requestId),
            );
            if (result.status === 'accepted' && target.status === 'CANCELLED')
              counts.discarded += 1;
          }
        } else if (roll < 0.62) {
          const target = pick([...requests.keys(), ...jobs.keys()]);
          if (target) track(await world.cancel(target));
        } else if (roll < 0.72) {
          const target = pick([...assets.values()].filter((a) => a.status === 'CANDIDATE'));
          if (target) track(await world.approve(target.assetId));
        } else if (roll < 0.8) {
          const target = pick([...assets.values()].filter((a) => !SETTLED_ASSET.has(a.status)));
          if (target) track(await world.retract(target.assetId));
        } else {
          const commits = accepted.filter((id) => id.startsWith('authoring.'));
          const target = rng() < 0.5 ? pick(commits) : pick(accepted.slice(-8));
          if (target) {
            let result = await world.undo(target);
            if (codeOf(result) === 'UNDO_UNSAFE') {
              counts.held += 1;
              // The DM settles the asset work the refusal names, undoes the
              // requests among the blockers, and tries again.
              if (target.startsWith('authoring.') && rng() < 0.7) {
                const blockers = (
                  result.status === 'rejected' ? (result.details?.['blockers'] ?? []) : []
                ) as { commandId: string; commandType: string }[];
                const settle = async (requestId: string) => {
                  const now = (await world.state()).assets;
                  if (now.jobs.get(requestId)?.status === 'STARTED') await world.cancel(requestId);
                  const asset = now.assets.get(assetIdFor(requestId));
                  if (asset && !SETTLED_ASSET.has(asset.status)) await world.retract(asset.assetId);
                };
                for (const blocker of blockers) {
                  if (blocker.commandType !== 'RequestAsset') continue;
                  await settle(`${blocker.commandId}#0`);
                  await world.undo(blocker.commandId);
                }
                for (const requestId of (await world.state()).assets.jobs.keys()) {
                  if (requestId.startsWith(`${target}#`)) await settle(requestId);
                }
                result = await world.undo(target);
                if (result.status === 'accepted') counts.settledThenUndone += 1;
              }
            }
            if (result.status === 'accepted') counts.undone += 1;
          }
        }

        const after = await world.state();
        expect(checkWorldIntegrity(after), `step ${String(step)}`).toEqual([]);
        for (const job of after.assets.jobs.values()) {
          if (job.status === 'STARTED') expect(after.entities.has(job.entityId)).toBe(true);
        }
        for (const asset of after.assets.assets.values()) {
          if (!SETTLED_ASSET.has(asset.status))
            expect(after.entities.has(asset.entityId)).toBe(true);
        }
      }
      await world.verified();
      expect(counts.undone + counts.held).toBeGreaterThan(0);
      for (const key of Object.keys(counts) as (keyof typeof counts)[]) totals[key] += counts[key];
      const final = await world.state();
      totals.orphanedLineage += [...final.assets.jobs.values()].filter(
        (job) => !final.entities.has(job.entityId),
      ).length;
    },
    60_000,
  );

  it('exercised every path: holds, settled undos, discarded late images, and orphaned lineage', () => {
    for (const [path, count] of Object.entries(totals)) expect(count, path).toBeGreaterThan(0);
  });
});
