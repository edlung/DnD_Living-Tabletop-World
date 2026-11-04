import { describe, expect, it } from 'vitest';

import type { EncounterState } from '../combat/records.ts';
import { EMPTY_WORLD_STATE, type EntityState, type WorldState } from '../kernel/state.ts';
import { deadForSeconds } from './deaths.ts';

/**
 * How long a creature has been dead (docs/adr/0056-characters-from-the-srd.md §5): in the rounds
 * of the fight it died in while that fight runs — 6 seconds each, a fight moving no world clock —
 * else in world time.
 */
const body = (status: EntityState['status']): EntityState => ({
  entityId: 'raider',
  kind: 'creature',
  name: 'Raider',
  description: '',
  existsSince: null,
  location: null,
  placement: null,
  status,
});

const world = (change: Partial<WorldState> = {}): WorldState => ({
  ...EMPTY_WORLD_STATE,
  clock: 1_000,
  entities: new Map([['raider', body('dead')]]),
  deaths: new Map([['raider', { at: 900, encounterId: 'fight', round: 2 }]]),
  ...change,
});

const fight = (encounterId: string, round: number) =>
  ({ encounterId, round }) as unknown as EncounterState;

describe('how long the dead have been dead', () => {
  it('counts the rounds of the fight it died in, while it runs', () => {
    expect(deadForSeconds(world({ encounter: fight('fight', 12) }), 'raider')).toBe(60);
    expect(deadForSeconds(world({ encounter: fight('fight', 2) }), 'raider')).toBe(0);
  });

  it('counts world time outside that fight', () => {
    expect(deadForSeconds(world(), 'raider')).toBe(100);
    expect(deadForSeconds(world({ encounter: fight('another', 5) }), 'raider')).toBe(100);
  });

  it('knows no time for the living, and takes a death with no record as just now', () => {
    expect(
      deadForSeconds(world({ entities: new Map([['raider', body('active')]]) }), 'raider'),
    ).toBe(null);
    expect(deadForSeconds(world({ deaths: new Map() }), 'raider')).toBe(0);
  });
});
