import type { ResolvedProposable } from '../../kernel/decision.ts';
import type { RecordedEvent } from '../../kernel/events.ts';
import { isWithinLocation, placementAt } from '../../kernel/projections/world-view.ts';
import type { WorldState } from '../../kernel/state.ts';
import { isCombatant } from '../../combat/records.ts';
import {
  ACKNOWLEDGE,
  findingKey,
  nameOf,
  type ContinuityInput,
  type WarningDraft,
  voice,
} from './describe.ts';
import { edit, removal, replaced } from './edits.ts';

/**
 * Geography (docs/adr/0018-ai-authoring.md §3, docs/adr/0019-continuity-engine.md
 * §2): a witness must have been where it happened; an NPC appearing where a
 * fight runs is not part of it.
 */

/** Where an entity was at a world time, or before recorded history (`null`), under current canon. */
export function locationAt(
  state: WorldState,
  history: readonly RecordedEvent[],
  entityId: string,
  time: number | null,
): string | null {
  if (time !== null) return placementAt(state, history, entityId, time);
  let location: string | null = null;
  for (const event of history) {
    if (event.type !== 'EntityPlaced' || event.payload.entityId !== entityId) continue;
    if (event.payload.since !== null) continue;
    if ((state.commands.get(event.causation.commandId)?.undoneBy ?? null) !== null) continue;
    location = event.payload.locationId;
  }
  return location;
}

/**
 * Warning: a first-hand record (testimony the holder gave, or evidence) about
 * a place, while the holder was neither there, inside it, nor around it when
 * the record says it became known.
 */
export function witnessElsewhere(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  if (command.type !== 'AddKnowledge' || command.scope.kind !== 'NPC') return [];
  const holder = command.scope.npcId;
  const firstHand =
    (command.knowledgeType === 'TESTIMONY' && command.attributedTo === holder) ||
    command.knowledgeType === 'EVIDENCE';
  const places = (command.subjects ?? []).filter(
    (id) => input.state.entities.get(id)?.kind === 'location',
  );
  const [place] = places;
  if (!firstHand || place === undefined) return [];
  const at = locationAt(input.state, input.history, holder, command.knownSince);
  const there = (other: string) =>
    isWithinLocation(input.state, at ?? '', other) ||
    isWithinLocation(input.state, other, at ?? '');
  if (at !== null && places.some(there)) return [];

  const v = voice(input.state);
  const where =
    at === null
      ? v.say('nowhere recorded')
      : v.say('at {place}', { place: nameOf(input.state, at) });
  return [
    {
      key: findingKey('WITNESS_ELSEWHERE', index, holder),
      code: 'WITNESS_ELSEWHERE',
      commandIndex: index,
      entityIds: [holder, ...places],
      knowledgeIds: [command.knowledgeId],
      message: `${v.say('{holder} was {where} {when}, not at {places}', {
        holder: nameOf(input.state, holder),
        where,
        when: v.when(command.knownSince),
        places: places.map((id) => nameOf(input.state, id)).join(v.say(' or ')),
      })}. ${v.say(
        'The world records only where someone is now, not where they were before: tell it in the description, or accept this warning',
      )}`,
      // No option moves the holder (owner decisions 11, SI-D7): an NPC has one recorded place,
      // where they are now, so "place them there since then" would move them today. Past
      // whereabouts are future work; the DM tells the past in the description, makes it hearsay,
      // or accepts the warning.
      options: [
        edit(
          'Make it a rumor they heard',
          replaced(input.commands, index, { ...command, knowledgeType: 'RUMOR' }),
        ),
        ACKNOWLEDGE,
      ],
    },
  ];
}

/** Warning: an NPC appears where a fight is running, and does not take part in it. */
export function encounterHere(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  const encounter = input.state.encounter;
  if (!encounter) return [];
  const placed =
    command.type === 'CreateEntity'
      ? command.placement
        ? { entityId: command.entityId, locationId: command.placement.locationId }
        : null
      : command.type === 'PlaceEntity'
        ? { entityId: command.entityId, locationId: command.locationId }
        : null;
  if (!placed || isCombatant(input.state, placed.entityId)) return [];
  if (!isWithinLocation(input.state, placed.locationId, encounter.locationId)) return [];
  return [
    {
      key: findingKey('ENCOUNTER_HERE', index, placed.entityId),
      code: 'ENCOUNTER_HERE',
      commandIndex: index,
      entityIds: [placed.entityId, encounter.locationId],
      knowledgeIds: [],
      message: voice(input.state).say(
        'A fight is running at {place}; {name} would be there without taking part',
        {
          place: nameOf(input.state, encounter.locationId),
          name: nameOf(input.state, placed.entityId),
        },
      ),
      options: [...removal(input.commands, index), ACKNOWLEDGE],
    },
  ];
}
