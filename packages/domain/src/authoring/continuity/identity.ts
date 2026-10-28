import type { ResolvedProposable } from '../../kernel/decision.ts';
import { holderPerspective } from '../../knowledge/perspective.ts';
import { knownEntityIds } from '../../knowledge/projection.ts';
import {
  ACKNOWLEDGE,
  findingKey,
  nameOf,
  normalized,
  type ContinuityInput,
  type WarningDraft,
  voice,
} from './describe.ts';
import { edit, removal, replaced } from './edits.ts';

/**
 * Identity (docs/adr/0018-ai-authoring.md §3, docs/adr/0019-continuity-engine.md
 * §2). IDs never change; names may, but a name that is someone else's, or a
 * rename of someone the players know, is pointed out.
 */

/** Warning: a created or renamed NPC has another entity's name. */
export function nameInUse(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  const named =
    command.type === 'CreateEntity' ||
    (command.type === 'UpdateEntityProfile' && command.name !== undefined)
      ? { entityId: command.entityId, name: command.name ?? '' }
      : null;
  if (!named) return [];
  const others = [...input.state.entities.values()].filter(
    (entity) =>
      entity.entityId !== named.entityId && normalized(entity.name) === normalized(named.name),
  );
  if (others.length === 0) return [];
  const keepName =
    command.type === 'UpdateEntityProfile' && command.description !== undefined
      ? [
          edit(
            'Keep the current name',
            replaced(input.commands, index, {
              type: 'UpdateEntityProfile',
              entityId: command.entityId,
              description: command.description,
            }),
          ),
        ]
      : [];
  const v = voice(input.state);
  return [
    {
      key: findingKey('NAME_IN_USE', index),
      code: 'NAME_IN_USE',
      commandIndex: index,
      entityIds: [named.entityId, ...others.map((entity) => entity.entityId)],
      knowledgeIds: [],
      // Named as the DM knows them, with where each one is, never by ID (opaque since Gate 06).
      message: v.say('"{name}" is also the name of {others}', {
        name: named.name,
        others: others
          .map((entity) =>
            entity.placement
              ? v.say('{name} ({where})', {
                  name: nameOf(input.state, entity.entityId),
                  where: v.say('at {place}', {
                    place: nameOf(input.state, entity.placement.locationId),
                  }),
                })
              : nameOf(input.state, entity.entityId),
          )
          .join(v.say(' or ')),
      }),
      options: [...keepName, ...removal(input.commands, index), ACKNOWLEDGE],
    },
  ];
}

/**
 * Warning: renaming an NPC the party, the public, or any one character knows by name. Names are timeless
 * corrections (ADR 0006 §3), so every account they hold would show the new name.
 */
export function renameKnown(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  if (command.type !== 'UpdateEntityProfile' || command.name === undefined) return [];
  const current = input.before.entities.get(command.entityId);
  if (!current || current.name === command.name) return [];
  const knows = (perspective: Parameters<typeof knownEntityIds>[1]) =>
    knownEntityIds(input.before, perspective).has(command.entityId);
  const v = voice(input.state);
  const knownBy: string[] = (['PARTY', 'PUBLIC'] as const)
    .filter((kind) => knows(holderPerspective(input.before, { kind })))
    .map((kind) => v.say(kind.toLowerCase()));
  // A character alone may know the name too (owner decisions 11 review): their accounts change.
  const characters = [...input.before.entities.values()].filter(
    (entity) =>
      entity.kind === 'character' &&
      knows(holderPerspective(input.before, { kind: 'CHARACTER', characterId: entity.entityId })),
  );
  if (knownBy.length === 0 && characters.length === 0) return [];
  const readers = characters.map((entity) => entity.name).join(v.say(' or '));
  const description = v
    .say('{description} Also known as {name}.', {
      description: command.description ?? current.description,
      name: command.name,
    })
    .trim();
  return [
    {
      key: findingKey('RENAME_KNOWN', index, command.entityId),
      code: 'RENAME_KNOWN',
      commandIndex: index,
      entityIds: [command.entityId],
      knowledgeIds: [],
      message:
        knownBy.length > 0
          ? v.say(
              'The {kinds} know {name}; renaming changes that name in every account they hold',
              { kinds: knownBy.join(v.say(' and the ')), name: current.name },
            )
          : v.say(
              '{name} is known by name to {readers}; renaming changes that name in every account they hold',
              {
                readers,
                name: current.name,
              },
            ),
      options: [
        edit(
          v.say('Keep "{name}" and note "{other}" in the description', {
            name: current.name,
            other: command.name,
          }),
          replaced(input.commands, index, {
            type: 'UpdateEntityProfile',
            entityId: command.entityId,
            description,
          }),
        ),
        ACKNOWLEDGE,
      ],
    },
  ];
}
