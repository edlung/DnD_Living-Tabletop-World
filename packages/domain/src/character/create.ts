import type { CharacterChoices, CharacterSheet, ChoiceProblem } from '@ltw/contracts';

import { poolDice } from '../combat/port.ts';
import { decideEquipItem, decideGrantItem } from '../items/decide.ts';
import { decideCreateEntity } from '../kernel/decide/entities.ts';
import { accept, reject, type Decision, type DecisionContext } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { ResolvedCommandOf } from '../kernel/decision.ts';
import { foldDraftsWithEvents } from '../kernel/provisional.ts';
import type { WorldState } from '../kernel/state.ts';
import { decideAssignCharacter } from '../knowledge/decide.ts';
import { decideSetCharacterSheet } from './character.ts';
import { campaignOptions } from '../campaign/options.ts';

/**
 * A new character from the builder's choices (docs/adr/0056-characters-from-the-srd.md §2): the
 * rules build its sheet and starting equipment from the SRD's numbers with the command's own
 * dice; the World Engine records the character, its sheet, its items — the armor and shield worn —
 * and its player, all or nothing. Choices that do not hold are refused with their problems.
 */
export interface CharacterBuilderPort {
  build(
    choices: CharacterChoices,
    d6: () => number,
    language: 'en' | 'ru',
    /** The campaign's starting level (docs/adr/0056-characters-from-the-srd.md §3); 1 if absent. */
    startingLevel?: number,
  ):
    | {
        readonly ok: true;
        readonly sheet: CharacterSheet;
        /** Each stack with its name in the campaign's language. */
        readonly items: readonly {
          readonly catalogId: string;
          readonly name: string;
          readonly quantity: number;
          readonly wear?: 'body' | 'offhand';
        }[];
      }
    | { readonly ok: false; readonly problems: readonly ChoiceProblem[] };
  /**
   * A spell's level and name in the campaign's language, for a Spell Scroll scribed
   * (docs/adr/0057-encounters-maps-loot.md §9); null for no SRD spell.
   */
  spell?(
    spellId: string,
    language: 'en' | 'ru',
  ): { readonly level: number; readonly name: string } | null;
  /** A catalog entry's name and line in the campaign's language (an SRD entry's Russian, §9). */
  itemWords?(
    catalogId: string,
    language: 'en' | 'ru',
  ): { readonly name: string; readonly description: string } | null;
}

/** Where the party is: the first assigned character's place, else the current scene's. */
function partyPlace(state: WorldState): string | null {
  for (const characterId of state.roster.keys()) {
    const place = state.entities.get(characterId)?.placement?.locationId;
    if (place) return place;
  }
  const scene = state.activeSceneId === null ? undefined : state.scenes.get(state.activeSceneId);
  return scene?.locationId ?? null;
}

export function decideCreateCharacter(
  context: DecisionContext,
  command: ResolvedCommandOf<'CreateCharacter'>,
): Decision {
  const builder = context.characters;
  if (!builder) return reject('INVALID_CHARACTER', 'No character builder');
  const dice = poolDice(command.resolution.entropy);
  const language = context.state.campaign?.language === 'ru' ? 'ru' : 'en';
  const built = builder.build(
    command.choices,
    () => dice.roll(6),
    language,
    campaignOptions(context.state).startingLevel,
  );
  if (!built.ok)
    return reject('INVALID_CHARACTER', 'The choices do not make a character', {
      problems: built.problems,
    });
  const [characterId, ...itemIds] = command.resolution.ids;
  if (characterId === undefined || itemIds.length < built.items.length)
    return reject('INVALID_CHARACTER', 'Too many items for one character');
  const locationId = command.locationId ?? partyPlace(context.state);
  let state = context.state;
  const events: KernelEvent[] = [];
  const step = (decision: Decision): Decision | null => {
    if (!decision.ok) return decision;
    state = foldDraftsWithEvents({ ...context, state }, 'CreateCharacter', decision.events).state;
    events.push(...decision.events);
    return null;
  };
  const refused =
    step(
      decideCreateEntity(state, {
        type: 'CreateEntity',
        entityId: characterId,
        kind: 'character',
        name: command.name,
        existsSince: null,
        ...(locationId ? { placement: { locationId, since: null } } : {}),
      }),
    ) ??
    step(
      decideSetCharacterSheet(state, {
        type: 'SetCharacterSheet',
        entityId: characterId,
        sheet: built.sheet,
      }),
    );
  if (refused) return refused;
  for (const [index, item] of built.items.entries()) {
    const itemId = itemIds[index] ?? '';
    const failed =
      step(
        decideCreateEntity(state, {
          type: 'CreateEntity',
          entityId: itemId,
          kind: 'item',
          name: item.name,
          existsSince: null,
        }),
      ) ??
      step(
        decideGrantItem(state, {
          type: 'GrantItem',
          itemId,
          holderId: characterId,
          catalogId: item.catalogId,
          quantity: item.quantity,
        }),
      ) ??
      (item.wear
        ? step(
            decideEquipItem(state, {
              type: 'EquipItem',
              characterId,
              itemId,
              slot: item.wear,
              resolution: { ids: [], d20: null, entropy: [] },
            }),
          )
        : null);
    if (failed) return failed;
  }
  if (command.playerActorId !== undefined) {
    const assigned = step(
      decideAssignCharacter(state, {
        type: 'AssignCharacter',
        characterId,
        playerActorId: command.playerActorId,
      }),
    );
    if (assigned) return assigned;
  }
  return accept(...events);
}
