import type { ResolvedProposable } from '../../kernel/decision.ts';
import { holderPerspective } from '../../knowledge/perspective.ts';
import { knownEntityIds } from '../../knowledge/projection.ts';
import {
  ACKNOWLEDGE,
  findingKey,
  normalized,
  type ContinuityInput,
  type WarningDraft,
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
  return [
    {
      key: findingKey('NAME_IN_USE', index),
      code: 'NAME_IN_USE',
      commandIndex: index,
      entityIds: [named.entityId, ...others.map((entity) => entity.entityId)],
      knowledgeIds: [],
      message: `"${named.name}" is also the name of ${others.map((entity) => entity.entityId).join(', ')}`,
      options: [...keepName, ...removal(input.commands, index), ACKNOWLEDGE],
    },
  ];
}

/**
 * Warning: renaming an NPC the party or the public knows. Names are timeless
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
  const knownBy = (['PARTY', 'PUBLIC'] as const).filter((kind) =>
    knownEntityIds(input.before, holderPerspective(input.before, { kind })).has(command.entityId),
  );
  if (knownBy.length === 0) return [];
  const description =
    `${command.description ?? current.description} Also known as ${command.name}.`.trim();
  return [
    {
      key: findingKey('RENAME_KNOWN', index, command.entityId),
      code: 'RENAME_KNOWN',
      commandIndex: index,
      entityIds: [command.entityId],
      knowledgeIds: [],
      message: `The ${knownBy.map((kind) => kind.toLowerCase()).join(' and the ')} know ${current.name}; renaming changes that name in every account they hold`,
      options: [
        edit(
          `Keep "${current.name}" and note "${command.name}" in the description`,
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
