import { describe, expect, it } from 'vitest';

import { DM, ELOWEN, PLAYER } from '../authoring/testing/world.ts';
import { parseRecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { DM_VIEW, visualWorld } from './testing/world.ts';
import { entityPresentationAt, scenePresentationAt } from './views.ts';

/**
 * The past stays as it was (ADR 0023 §2; ADVERSARIAL_TESTS.md K.3): random
 * weather, walks, and time. The views of every passed moment, taken when the
 * clock left it, are identical when resolved at the end, and again from the
 * stored history.
 */
const LOCATIONS = ['ravenford', 'market-square', 'north-gate', 'orins-alchemy', 'golden-stag-inn'];
const WEATHERS = ['clear', 'overcast', 'rain', 'storm', 'fog', 'snow'];
const WALKS = ['market-square', 'north-gate', 'orins-alchemy', 'golden-stag-inn'];

describe('views of the past under later history', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    'seed %i',
    async (seed) => {
      const rng = mulberry32(seed * 6_151);
      const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
      const world = await visualWorld();
      const elowen = await world.elowen();
      const look = async (time: number | null) => {
        const snapshot = await world.snapshot();
        return {
          scenes: LOCATIONS.map((id) => scenePresentationAt(snapshot, DM_VIEW, id, time)),
          seen: ['mira-vale', 'orin-stonebeard', 'ravenford', ELOWEN].map((id) =>
            entityPresentationAt(snapshot, elowen, id, time),
          ),
        };
      };
      const taken: { time: number; views: Awaited<ReturnType<typeof look>> }[] = [];
      for (let step = 0; step < 25; step += 1) {
        const roll = rng();
        if (roll < 0.4) {
          await world.as(DM, {
            type: 'SetWeather',
            locationId: pick(LOCATIONS),
            weather: pick(WEATHERS),
          });
        } else if (roll < 0.7) {
          await world.as(PLAYER, {
            type: 'EnterLocation',
            characterId: ELOWEN,
            locationId: pick(WALKS),
          });
        } else {
          const clock = (await world.state()).clock;
          taken.push({ time: clock, views: await look(clock) });
          await world.dm({ type: 'AdvanceWorldTime', by: 3_600 * (1 + Math.floor(rng() * 8)) });
        }
      }
      expect(taken.length).toBeGreaterThan(0);
      const end = await world.snapshot();
      const stored = (JSON.parse(JSON.stringify(end.history)) as unknown[]).map(parseRecordedEvent);
      const replayed = { state: replay(stored), history: stored };
      for (const { time, views } of taken) {
        expect(await look(time)).toEqual(views);
        expect(LOCATIONS.map((id) => scenePresentationAt(replayed, DM_VIEW, id, time))).toEqual(
          views.scenes,
        );
      }
      await world.verified();
    },
    60_000,
  );
});
