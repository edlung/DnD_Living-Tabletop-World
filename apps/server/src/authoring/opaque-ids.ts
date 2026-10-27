import type { ProposableCommand } from '@ltw/contracts';

/**
 * The server, not the model, names what an AI proposal creates (docs/adr/0008-knowledge-
 * boundary.md, Gate 06 remediation, G06-client-01). A model writes an `entityId` for a new entity
 * so the proposal's later commands can refer to it ("tomas-reed"); that ID would reach every player
 * who meets the entity, even unnamed. Each one is replaced with a generated opaque ID, and every
 * reference in the proposal follows it. IDs of entities that already exist are left alone. The
 * authoring service applies it to every AI proposal (`service.ts`); the image smoke to the proposal
 * it writes from the local interpreter.
 */
export function withOpaqueEntityIds(
  commands: readonly ProposableCommand[],
  next: () => string,
): ProposableCommand[] {
  const renamed = new Map<string, string>();
  for (const command of commands) {
    if (command.type === 'CreateEntity' && command.entityId !== undefined) {
      renamed.set(command.entityId, next());
    }
  }
  if (renamed.size === 0) return [...commands];
  const id = (value: string): string => renamed.get(value) ?? value;
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
      case 'SetClaim':
        return {
          ...command,
          target:
            command.target.kind === 'clue'
              ? { ...command.target, clueId: id(command.target.clueId) }
              : command.target,
          claim: { ...command.claim, subjectId: id(command.claim.subjectId) },
        };
      case 'AddKnowledge':
        return {
          ...command,
          scope:
            command.scope.kind === 'NPC'
              ? { ...command.scope, npcId: id(command.scope.npcId) }
              : command.scope.kind === 'CHARACTER'
                ? { ...command.scope, characterId: id(command.scope.characterId) }
                : command.scope,
          ...(command.subjects ? { subjects: command.subjects.map(id) } : {}),
          ...(command.attributedTo ? { attributedTo: id(command.attributedTo) } : {}),
        };
      case 'AdvanceWorldTime':
      case 'SetDisclosure':
        return command;
    }
  });
}
