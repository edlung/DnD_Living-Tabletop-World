import { describe, expect, it } from 'vitest';

import { DM } from '../authoring/testing/world.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { chronicleWorld } from './testing/world.ts';

/**
 * Chapters under random memories and undos (ADR 0024 §4): after every step
 * the state is consistent, so no standing chapter tells a memory or cites
 * knowledge that is gone; at the end the re-decision oracle re-tells every
 * standing chapter identically, and stored JSON replays to the same state.
 */
const KNOWLEDGE = ['party-mira-departure', 'party-goblin-hypothesis', 'party-who-attacked'];

describe('chapters under random undo', () => {
  it.each([1, 2, 3, 4, 5])(
    'seed %i',
    async (seed) => {
      const rng = mulberry32(seed * 7_919);
      const pick = <T>(items: readonly T[]): T | undefined =>
        items.length === 0 ? undefined : items[Math.floor(rng() * items.length)];
      const world = await chronicleWorld();
      const accepted: string[] = [];
      const counts = { chapters: 0, undone: 0, held: 0 };
      for (let step = 0; step < 24; step += 1) {
        const roll = rng();
        if (roll < 0.4) {
          const cited = pick(KNOWLEDGE);
          const result = await world.as(DM, {
            type: 'RecordMemory',
            scope: { kind: 'PARTY' },
            memoryKind: 'DECISION',
            summary: `We weighed what we knew, step ${String(step)}.`,
            occurredAt: (await world.state()).clock,
            ...(cited && rng() < 0.6 ? { relatedKnowledge: [cited] } : {}),
          });
          if (result.status === 'accepted') accepted.push(result.commandId);
        } else if (roll < 0.65) {
          const result = await world.generate({ title: `Chapter ${String(step)}` });
          if (result.status === 'accepted') {
            accepted.push(result.commandId);
            counts.chapters += 1;
          }
        } else if (roll < 0.8) {
          await world.dm({ type: 'AdvanceWorldTime', by: 600 });
        } else {
          const target = pick(accepted.slice(-6));
          if (target) {
            const result = await world.undo(target);
            if (result.status === 'accepted') counts.undone += 1;
            else counts.held += 1;
          }
        }
        expect(checkWorldIntegrity(await world.state()), `step ${String(step)}`).toEqual([]);
      }
      expect(counts.chapters).toBeGreaterThan(0);
      await world.verified();
    },
    60_000,
  );
});
