import type {
  DmEditCommandType,
  EntityKind,
  EntityRef,
  EntityStatus,
  KernelCommandOf,
  KnowledgeScope,
} from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * The DM's changes by hand in words (docs/adr/0058-campaign-content.md §1), as the DM's history
 * lists them: what was made, changed, moved or given, named as the DM knows it.
 */
const MADE: Readonly<Record<EntityKind, string>> = {
  location: 'Made the place {name}',
  npc: 'Made {name}',
  creature: 'Made the creature {name}',
  item: 'Made the object {name}',
  character: 'Made the character {name}',
  faction: 'Made the faction {name}',
  feature: 'Made the feature {name}',
};

const STATUS: Readonly<Record<EntityStatus, string>> = {
  active: '{name} is back',
  dead: '{name} is dead',
  destroyed: '{name} is gone',
};

const WHO: Readonly<Record<KnowledgeScope['kind'], string>> = {
  WORLD_TRUTH: 'the world’s truth',
  DM: 'the DM',
  PUBLIC: 'everyone',
  PARTY: 'the party',
  CHARACTER: '{name}',
  NPC: '{name}',
};

/** A statement in a line: its first 80 characters. */
const quoted = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);

export function describeEdit(
  t: Translate,
  command: KernelCommandOf<DmEditCommandType>,
  directory: readonly EntityRef[],
): string {
  const name = (id: string) => directory.find((one) => one.entityId === id)?.name ?? id;
  switch (command.type) {
    case 'CreateEntity':
      return t(MADE[command.kind], { name: command.name });
    case 'UpdateEntityProfile':
      return t('Changed {name}', { name: command.name ?? name(command.entityId) });
    case 'PlaceEntity':
      return t('Moved {name} to {place}', {
        name: name(command.entityId),
        place: name(command.locationId),
      });
    case 'ChangeEntityStatus':
      return t(STATUS[command.status], { name: name(command.entityId) });
    case 'AddClue':
      return t('A clue on {name}: “{statement}”', {
        name: name(command.entityId),
        statement: quoted(command.statement),
      });
    case 'AddKnowledge': {
      const { scope } = command;
      const holder =
        scope.kind === 'CHARACTER' ? scope.characterId : scope.kind === 'NPC' ? scope.npcId : '';
      return t('Known to {who}: “{statement}”', {
        who: t(WHO[scope.kind], { name: name(holder) }),
        statement: quoted(command.statement),
      });
    }
    case 'GrantItem':
      return t('Gave {item} to {holder}', {
        item: name(command.itemId),
        holder: name(command.holderId),
      });
    case 'SetStatBlock':
      return t('Set the numbers of {name}', { name: name(command.entityId) });
    case 'SetMerchant':
      return command.priceFactor === null
        ? t('{name} keeps no shop', { name: name(command.npcId) })
        : t('{name} keeps a shop at {percent}%', {
            name: name(command.npcId),
            percent: command.priceFactor,
          });
    case 'SetMapPins':
      return t('Pinned places on the map of {region}: {count}', {
        region: name(command.regionId),
        count: command.pins.length,
      });
    case 'SetRoute':
      return command.route === null
        ? t('Took the route away: {from} — {to}', {
            from: name(command.fromId),
            to: name(command.toId),
          })
        : t('Set the route {from} — {to}: {miles} mi', {
            from: name(command.fromId),
            to: name(command.toId),
            miles: command.route.miles,
          });
    case 'WorkDowntime':
      return t('Days of downtime given: {days}', { days: command.days });
    case 'SetQuest':
      return command.quest === null
        ? t('Took a quest away')
        : t('Wrote the quest {title}', { title: command.quest.title });
    case 'SetQuestStep':
      return command.done
        ? t('Step {step} of a quest done', { step: command.step + 1 })
        : t('Step {step} of a quest not done', { step: command.step + 1 });
  }
}
