import type { EntityRef, ProposableCommand } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

const humanize = (id: string) => id.replaceAll('-', ' ');

/** A name the DM can read: the directory's, or the ID made readable. */
export const nameFor = (directory: readonly EntityRef[], id: string): string =>
  directory.find((entity) => entity.entityId === id)?.name ?? humanize(id);

/**
 * One plain sentence per proposed command, for the DM's review. It describes the
 * command only; whether it may commit is the server's answer in the preview. Names are
 * placed as given, never declined (docs/adr/0031-play-language.md §5).
 */
export function describeCommand(
  t: Translate,
  command: ProposableCommand,
  directory: readonly EntityRef[],
  names: ReadonlyMap<string, string> = new Map(),
): string {
  const who = (id: string) => names.get(id) ?? nameFor(directory, id);
  switch (command.type) {
    case 'CreateEntity': {
      const place = command.placement
        ? t(' at {place}', { place: who(command.placement.locationId) })
        : '';
      const about = command.description
        ? t(' — {description}', { description: command.description })
        : '';
      return `${t('Create {kind} {name}', { kind: t(command.kind), name: command.name })}${place}${about}`;
    }
    case 'PlaceEntity':
      return t('Move {name} to {place}', {
        name: who(command.entityId),
        place: who(command.locationId),
      });
    case 'UpdateEntityProfile':
      return `${t('Update {name}', { name: who(command.entityId) })}${
        command.name ? t(' (name: {value})', { value: command.name }) : ''
      }${command.description ? t(' (description: {value})', { value: command.description }) : ''}`;
    case 'ChangeEntityStatus':
      return t('Change {name} to {status}', {
        name: who(command.entityId),
        status: t(command.status),
      });
    case 'AdvanceWorldTime':
      return t('Advance world time by {seconds} seconds', {
        seconds: String(command.by),
      });
    case 'AddKnowledge':
      return command.scope.kind === 'NPC'
        ? t('{name} holds {type}: “{statement}”', {
            name: who(command.scope.npcId),
            type: t(command.knowledgeType.toLowerCase()),
            statement: command.statement,
          })
        : t('Add {type}: “{statement}”', {
            type: t(command.knowledgeType.toLowerCase()),
            statement: command.statement,
          });
    case 'SetDisclosure':
      return t('This account is {disclosure} to be shared when asked', {
        disclosure: t(command.disclosure.toLowerCase()),
      });
    case 'SetClaim':
      return t('Set the claim a record makes');
    case 'SetRelationship':
      return t('Set an NPC’s attitude toward the party');
  }
}
