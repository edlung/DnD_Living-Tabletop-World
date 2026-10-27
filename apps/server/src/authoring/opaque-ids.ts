import { createHash } from 'node:crypto';

import type { ProposableCommand } from '@ltw/contracts';

/**
 * The server, not the model, names what an AI proposal creates (docs/adr/0008-knowledge-
 * boundary.md, Gate 06 remediation, G06-client-01). A model writes an `entityId` for a new entity
 * and a `knowledgeId` for a new record so the proposal's later commands can refer to them
 * ("tomas-reed", "rumor-sable-is-the-watcher"); those IDs would reach every player who meets the
 * entity unnamed or holds the record. Each one is replaced with an opaque ID, and every reference
 * in the proposal follows it. IDs of entities and records that already exist are left alone.
 * The authoring service applies it to every AI proposal (`service.ts`, with `traceScopedIds`);
 * the image smoke to the proposal it writes from the local interpreter.
 */
export type OpaqueIdKind =
  Extract<ProposableCommand, { type: 'CreateEntity' }>['kind'] | 'knowledge';

/** The opaque ID for a model-chosen ID of the given kind. */
export type OpaqueIdFor = (modelId: string, kind: OpaqueIdKind) => string;

/**
 * IDs derived from the trace (DM-only, never shown to players) and the model's own ID: the same
 * trace proposed twice (a retry, a double click) creates the same IDs, so its second commit
 * collides (`ID_ALREADY_USED`) instead of creating everything again.
 */
export const traceScopedIds =
  (traceId: string): OpaqueIdFor =>
  (modelId, kind) =>
    `${kind}-${createHash('sha256').update(`${traceId}:${kind}:${modelId}`).digest('hex').slice(0, 8)}`;

export function withOpaqueIds(
  commands: readonly ProposableCommand[],
  idFor: OpaqueIdFor,
): ProposableCommand[] {
  const entities = new Map<string, string>();
  const records = new Map<string, string>();
  for (const command of commands) {
    if (command.type === 'CreateEntity' && command.entityId !== undefined) {
      entities.set(command.entityId, idFor(command.entityId, command.kind));
    }
    if (command.type === 'AddKnowledge' && command.knowledgeId !== undefined) {
      records.set(command.knowledgeId, idFor(command.knowledgeId, 'knowledge'));
    }
  }
  if (entities.size === 0 && records.size === 0) return [...commands];
  const id = (value: string): string => entities.get(value) ?? value;
  const record = (value: string): string => records.get(value) ?? value;
  return commands.map((command): ProposableCommand => {
    switch (command.type) {
      case 'CreateEntity':
        return {
          ...command,
          ...(command.entityId === undefined ? {} : { entityId: id(command.entityId) }),
          ...(command.placement
            ? { placement: { ...command.placement, locationId: id(command.placement.locationId) } }
            : {}),
          ...(command.location
            ? {
                location: {
                  ...command.location,
                  parentId:
                    command.location.parentId === null ? null : id(command.location.parentId),
                },
              }
            : {}),
        };
      case 'PlaceEntity':
        return { ...command, entityId: id(command.entityId), locationId: id(command.locationId) };
      case 'UpdateEntityProfile':
      case 'ChangeEntityStatus':
        return { ...command, entityId: id(command.entityId) };
      case 'SetRelationship':
        return { ...command, npcId: id(command.npcId) };
      case 'SetDisclosure':
        return { ...command, knowledgeId: record(command.knowledgeId) };
      case 'SetClaim':
        return {
          ...command,
          target:
            command.target.kind === 'clue'
              ? { ...command.target, clueId: id(command.target.clueId) }
              : { ...command.target, knowledgeId: record(command.target.knowledgeId) },
          claim: { ...command.claim, subjectId: id(command.claim.subjectId) },
        };
      case 'AddKnowledge':
        return {
          ...command,
          ...(command.knowledgeId === undefined
            ? {}
            : { knowledgeId: record(command.knowledgeId) }),
          scope:
            command.scope.kind === 'NPC'
              ? { ...command.scope, npcId: id(command.scope.npcId) }
              : command.scope.kind === 'CHARACTER'
                ? { ...command.scope, characterId: id(command.scope.characterId) }
                : command.scope,
          ...(command.subjects ? { subjects: command.subjects.map(id) } : {}),
          ...(command.attributedTo ? { attributedTo: id(command.attributedTo) } : {}),
          ...(command.relations
            ? {
                relations: command.relations.map((relation) => ({
                  ...relation,
                  knowledgeId: record(relation.knowledgeId),
                })),
              }
            : {}),
        };
      case 'AdvanceWorldTime':
        return command;
    }
  });
}
