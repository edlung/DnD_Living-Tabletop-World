import { entityIdSchema, worldTimeSchema } from '@ltw/contracts';
import { z } from 'zod';

import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * When a creature died (docs/adr/0056-characters-from-the-srd.md §5): the world time, and the
 * fight and its round when one was running. The spells that return the dead count from it — in
 * the fight's rounds while that fight runs (a fight's rounds move no world clock), else in world
 * time. Kept while it is dead; undo restores the record before.
 */
export const deathRecordSchema = z
  .object({
    at: worldTimeSchema,
    encounterId: entityIdSchema.nullable(),
    round: z.number().int().min(0).nullable(),
  })
  .strict();
export type DeathRecord = z.infer<typeof deathRecordSchema>;

export const deathRestoreSchemas = [
  z
    .object({
      fact: z.literal('death'),
      entityId: entityIdSchema,
      value: deathRecordSchema.nullable(),
    })
    .strict(),
] as const;

const ROUND_SECONDS = 6;

/** The record a status change leaves: a death's time, or none once it lives again. */
export function withDeath(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'EntityStatusChanged' }>,
): WorldState {
  const { entityId, from, to } = event.payload;
  if (to === 'dead') {
    const fight = state.encounter;
    const record: DeathRecord = {
      at: event.worldTime,
      encounterId: fight?.encounterId ?? null,
      round: fight?.round ?? null,
    };
    return { ...state, deaths: withEntry(state.deaths, entityId, record) };
  }
  return from === 'dead' ? { ...state, deaths: withoutEntry(state.deaths, entityId) } : state;
}

export function applyDeathRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'death' }>,
): WorldState {
  return {
    ...state,
    deaths:
      restore.value === null
        ? withoutEntry(state.deaths, restore.entityId)
        : withEntry(state.deaths, restore.entityId, restore.value),
  };
}

/** How long a dead creature has been dead, in seconds; null when it is not dead. */
export function deadForSeconds(state: WorldState, entityId: string): number | null {
  if (state.entities.get(entityId)?.status !== 'dead') return null;
  const death = state.deaths.get(entityId);
  // A death no record tells the time of (before Stage 660e): as though just now.
  if (!death) return 0;
  const fight = state.encounter;
  if (fight && death.round !== null && death.encounterId === fight.encounterId)
    return Math.max(0, (fight.round - death.round) * ROUND_SECONDS);
  return Math.max(0, state.clock - death.at);
}
