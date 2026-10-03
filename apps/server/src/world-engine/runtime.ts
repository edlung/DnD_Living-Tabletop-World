import { randomInt, randomUUID } from 'node:crypto';

import { WorldEngine, type IdGenerator, type SkillCheckPort, type WallClock } from '@ltw/domain';
import { skillCheckPort, type Dice } from '@ltw/rules';
import type pg from 'pg';

import { PostgresEventStore } from './postgres-event-store.ts';

/** Production sources of nondeterminism; their outputs are recorded in events. */
export const randomIds: IdGenerator = { next: () => randomUUID() };
export const systemClock: WallClock = { now: () => new Date().toISOString() };
export const cryptoDice: Dice = { roll: (sides) => randomInt(1, sides + 1) };
/** Skill checks resolved by the Rules Engine with cryptographic dice (ADR 0013). */
export const rulesSkillChecks: SkillCheckPort = skillCheckPort(cryptoDice);

/** The World Engine backed by PostgreSQL. One instance per process. */
export function createWorldEngine(pool: pg.Pool): WorldEngine {
  return new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: randomIds,
    clock: systemClock,
    checks: rulesSkillChecks,
  });
}
