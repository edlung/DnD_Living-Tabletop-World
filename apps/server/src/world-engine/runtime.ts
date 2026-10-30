import { randomInt, randomUUID } from 'node:crypto';

import { createCombatEngine } from '@ltw/combat';
import {
  WorldEngine,
  type EntropySource,
  type IdGenerator,
  type SkillCheckPort,
  type WallClock,
} from '@ltw/domain';
import { skillCheckPort, type Dice } from '@ltw/rules';
import type pg from 'pg';

import { PostgresEventStore } from './postgres-event-store.ts';
import { PostgresCampaignPublication } from '../campaigns/postgres-publication.ts';
import { PublishedEventStore } from '../campaigns/published-event-store.ts';
import type { CampaignPublication } from '../campaigns/publication.ts';

/** Production sources of nondeterminism; their outputs are recorded in events. */
export const randomIds: IdGenerator = { next: () => randomUUID() };
export const systemClock: WallClock = { now: () => new Date().toISOString() };
export const cryptoDice: Dice = { roll: (sides) => randomInt(1, sides + 1) };
/** Skill checks resolved by the Rules Engine with cryptographic dice (ADR 0013). */
export const rulesSkillChecks: SkillCheckPort = skillCheckPort(cryptoDice);
/** Uniform 32-bit values for combat, drawn at resolution and recorded with the command (ADR 0015). */
export const cryptoEntropy: EntropySource = { next: () => randomInt(0, 2 ** 32) };

/** The World Engine backed by PostgreSQL. One instance per process. */
export function createWorldEngine(
  pool: pg.Pool,
  publication: CampaignPublication = new PostgresCampaignPublication(pool),
): WorldEngine {
  return engine(new PublishedEventStore(new PostgresEventStore(pool), publication));
}
/** Narrow bootstrap/reconciliation and full-store replay tools only. Never ordinary HTTP. */
export function createRawWorldEngine(pool: pg.Pool): WorldEngine {
  return engine(new PostgresEventStore(pool));
}
function engine(store: PostgresEventStore | PublishedEventStore): WorldEngine {
  return new WorldEngine({
    store,
    ids: randomIds,
    clock: systemClock,
    checks: rulesSkillChecks,
    combat: createCombatEngine(),
    entropy: cryptoEntropy,
  });
}
