import { characterSheetSchema, entityIdSchema, type EntityKind } from '@ltw/contracts';
import { z } from 'zod';

import { findEntity } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import { withEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * Canonical character sheets (docs/adr/0011-ruleset-srd-5-2.md). The DM or
 * system sets a sheet; gameplay changes its resources from Stage 80 on.
 * Legality lives in @ltw/rules, which reads these sheets.
 */
export const characterSheetSetPayloadSchema = z
  .object({ entityId: entityIdSchema, sheet: characterSheetSchema })
  .strict();

export const characterRestoreSchemas = [
  z
    .object({
      fact: z.literal('sheet'),
      entityId: entityIdSchema,
      value: characterSheetSchema.nullable(),
    })
    .strict(),
] as const;

const SHEET_KINDS: ReadonlySet<EntityKind> = new Set(['character', 'npc', 'creature']);

export function decideSetCharacterSheet(
  state: WorldState,
  command: ResolvedCommandOf<'SetCharacterSheet'>,
): Decision {
  const entity = findEntity(state, command.entityId);
  if (!entity.ok) return entity;
  if (!SHEET_KINDS.has(entity.value.kind)) {
    return reject(
      'INVALID_ENTITY_DEFINITION',
      `Entities of kind "${entity.value.kind}" have no sheet`,
    );
  }
  return accept({
    type: 'CharacterSheetSet',
    payload: { entityId: command.entityId, sheet: command.sheet },
  });
}

export function applyCharacterSheetSet(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'CharacterSheetSet' }>,
): WorldState {
  return {
    ...state,
    characterSheets: withEntry(state.characterSheets, event.payload.entityId, event.payload.sheet),
  };
}
