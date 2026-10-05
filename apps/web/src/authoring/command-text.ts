import type { EntityRef, ProposableCommand } from '@ltw/contracts';

const humanize = (id: string) => id.replaceAll('-', ' ');

/** A name the DM can read: the directory's, or the ID made readable. */
export const nameFor = (directory: readonly EntityRef[], id: string): string =>
  directory.find((entity) => entity.entityId === id)?.name ?? humanize(id);

/**
 * One plain sentence per proposed command, for the DM's review. It describes the
 * command only; whether it may commit is the server's answer in the preview.
 */
export function describeCommand(
  command: ProposableCommand,
  directory: readonly EntityRef[],
  names: ReadonlyMap<string, string> = new Map(),
): string {
  const who = (id: string) => names.get(id) ?? nameFor(directory, id);
  switch (command.type) {
    case 'CreateEntity':
      return `Create ${command.kind} ${command.name}${
        command.placement ? ` at ${who(command.placement.locationId)}` : ''
      }${command.description ? ` — ${command.description}` : ''}`;
    case 'PlaceEntity':
      return `Move ${who(command.entityId)} to ${who(command.locationId)}`;
    case 'UpdateEntityProfile':
      return `Update ${who(command.entityId)}${command.name ? ` (name: ${command.name})` : ''}${
        command.description ? ` (description: ${command.description})` : ''
      }`;
    case 'ChangeEntityStatus':
      return `Change ${who(command.entityId)} to ${command.status}`;
    case 'AdvanceWorldTime':
      return `Advance world time by ${String(command.by)} seconds`;
    case 'AddKnowledge':
      return `${command.scope.kind === 'NPC' ? `${who(command.scope.npcId)} holds` : `Add`} ${command.knowledgeType.toLowerCase()}: “${command.statement}”`;
    case 'SetDisclosure':
      return `This account is ${command.disclosure.toLowerCase()} to be shared when asked`;
    case 'SetClaim':
      return 'Set the claim a record makes';
    case 'SetRelationship':
      return 'Set an NPC’s attitude toward the party';
  }
}
