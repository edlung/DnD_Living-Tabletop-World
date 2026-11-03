import {
  ASSET_WORKER_COMMAND_TYPES,
  type CombatAction,
  type DmHistoryEntry,
  type DmSubstitutionEntry,
  type DmWorldEntry,
  type EntityRef,
  type KernelCommandOf,
  type KernelCommandType,
  type SubstitutionReason,
} from '@ltw/contracts';
import { readableLabel, type Translate } from '@ltw/ui';

import { nameFor } from '../authoring/command-text.ts';
import { RESOURCE_NAMES } from '../character/feature-words.ts';
import { spellName } from '../exploration/outcome-messages.ts';
import { describeHand } from './hand-words.ts';
import { optionChanges } from './option-words.ts';
import { formatWorldTime } from './world-time.ts';

/**
 * The words of the DM history (docs/adr/0033-live-session.md §7). Every sentence is an English
 * key the client dictionary translates; names come from the DM's own directory, or the ID made
 * readable, and are never declined (docs/adr/0031-play-language.md §5).
 */
export const REASON_TEXT: Readonly<Record<SubstitutionReason, string>> = {
  absent: 'The player is absent',
  asked: 'The player asked the DM',
  other: 'Another reason',
};

/** A reaction as the DM's history says it was used (docs/adr/0046-reactions-beyond-counterspell.md). */
const REACTION_WORDS: Readonly<Record<KernelCommandOf<'UseReaction'>['reaction'], string>> = {
  counterspell: 'Cast Counterspell as a reaction',
  'opportunity-attack': 'Made an opportunity attack',
  'inspiration-reroll': 'Rolled again with Heroic Inspiration',
  shield: 'Cast Shield as a reaction',
  'uncanny-dodge': 'Used Uncanny Dodge',
  'hellish-rebuke': 'Cast Hellish Rebuke as a reaction',
  'feather-fall': 'Cast Feather Fall as a reaction',
};

/** A command type as a step the DM can name: blockers and undo actions. */
export const STEP_TEXT: Readonly<Record<KernelCommandType, string>> = {
  CreateCampaign: 'create campaign',
  BootstrapCampaign: 'start campaign from preparation',
  CreateEntity: 'create entity',
  PlaceEntity: 'place entity',
  UpdateEntityProfile: 'update entity profile',
  ChangeEntityStatus: 'change entity status',
  StartScene: 'start scene',
  EndScene: 'end scene',
  AdvanceWorldTime: 'advance world time',
  UndoCommand: 'undo command',
  AddKnowledge: 'add knowledge',
  AssignCharacter: 'assign character',
  ReleaseCharacter: 'release character',
  RecordMemory: 'record memory',
  StartSession: 'start session',
  EndSession: 'end session',
  SetCharacterSheet: 'set character sheet',
  EnterLocation: 'enter location',
  AskAbout: 'ask about',
  ShowEvidence: 'show evidence',
  InsightCheck: 'insight check',
  ExamineEntity: 'examine entity',
  FormHypothesis: 'form hypothesis',
  AddClue: 'add clue',
  SetDisclosure: 'set disclosure',
  SetClaim: 'set claim',
  SetStatBlock: 'set stat block',
  StartCombat: 'start combat',
  MoveCombatant: 'move combatant',
  Attack: 'attack',
  CastSpell: 'cast spell',
  TakeAction: 'take an action',
  MakeReadiedAttack: 'make the readied attack',
  SpendInspiration: 'spend heroic inspiration',
  UseFeature: 'use a class feature',
  EndTurn: 'end turn',
  EndCombat: 'end combat',
  UseReaction: 'use reaction',
  DeclineReaction: 'decline reaction',
  CloseReactionWindow: 'close reaction window',
  ApplyAuthoring: 'apply authoring',
  SetRelationship: 'set relationship',
  RequestAsset: 'request asset',
  StartAssetJob: 'start asset job',
  CompleteAssetJob: 'complete asset job',
  FailAssetJob: 'fail asset job',
  CancelAssetRequest: 'cancel asset request',
  RetractAsset: 'retract asset',
  ApproveAsset: 'approve asset',
  SetWeather: 'set weather',
  SetCampaignOptions: 'set campaign options',
  AskPortrait: 'ask for a portrait',
  GenerateChronicle: 'generate chronicle',
  GrantItem: 'grant item',
  EquipItem: 'equip item',
  UnequipItem: 'unequip item',
  UseItem: 'use item',
  GiveItem: 'give item',
  DropItem: 'drop item',
  TakeItem: 'take item',
  AttuneItem: 'attune to an item',
  IdentifyItem: 'identify an item',
  DawnRecharge: 'dawn: charges regained',
  AdjustHitPoints: 'change hit points',
  SetCondition: 'set a condition',
  SetExhaustion: 'set Exhaustion',
  SetInspiration: 'set Heroic Inspiration',
  CommandCreature: 'handed a creature to a player',
  AddCombatant: 'add a combatant',
  RemoveCombatant: 'remove a combatant',
  DelayTurn: 'delay a turn',
  SetInitiative: 'set initiative',
  PlaceCombatant: 'set a combatant down',
  PaintTerrain: 'paint the ground of the fight',
  AddObject: 'bring an object into the fight',
  SetLight: 'set the light of the fight',
  ExposeToHazard: 'expose the party to a hazard',
  SpringTrap: 'spring a trap',
  InflictMentalStress: 'mental stress',
  InfectWithContagion: 'infect with a contagion',
  ContagionCourse: 'a contagion’s course',
  CreateCharacter: 'make a character',
  UseCreatureAction: 'use a creature’s action',
};

/** The actions' names (docs/adr/0045-conditions-and-actions.md §5), English keys. */
const ACTION_WORDS: Readonly<Record<CombatAction, string>> = {
  dash: 'Dash',
  disengage: 'Disengage',
  dodge: 'Dodge',
  help: 'Help',
  hide: 'Hide',
  influence: 'Influence',
  ready: 'Ready an action',
  search: 'Search',
  study: 'Study',
  utilize: 'Utilize',
  escape: 'Escape a grapple',
  release: 'Let go',
  'first-aid': 'First aid',
  mount: 'Mount',
  dismount: 'Dismount',
};

/** What the DM did for the character, in plain words. */
export function describeSubstitution(
  t: Translate,
  command: DmSubstitutionEntry['command'],
  directory: readonly EntityRef[],
): string {
  return describePlayerAction(t, command, (id) => nameFor(directory, id));
}

/**
 * A player command in plain words, with names as the reader may know them: the DM's directory
 * in the history, the player's own directory (and neutral words for the rest) in the player's
 * notice of an undone action.
 */
export function describePlayerAction(
  t: Translate,
  command: DmSubstitutionEntry['command'],
  name: (id: string) => string,
): string {
  switch (command.type) {
    case 'EndTurn':
      return t('Ended the turn');
    case 'Attack':
      // The extra attacks (docs/adr/0047-weapons.md §2, §4) say which they were.
      if (command.unarmed !== undefined) {
        return command.unarmed === 'grapple'
          ? t('Tried to grapple {target}', { target: name(command.targetId) })
          : t('Tried to shove {target}', { target: name(command.targetId) });
      }
      return command.extra === 'offhand'
        ? t('Attacked {target} with the other hand', { target: name(command.targetId) })
        : command.extra === 'cleave'
          ? t('Cleaved through to {target}', { target: name(command.targetId) })
          : t('Attacked {target}', { target: name(command.targetId) });
    case 'CastSpell':
      return command.targetId === undefined
        ? t('Cast {spell}', { spell: spellName(t, command.spellId) })
        : t('Cast {spell} on {target}', {
            spell: spellName(t, command.spellId),
            target: name(command.targetId),
          });
    case 'MoveCombatant': {
      const last = command.path.at(-1);
      return last ? t('Moved to {x}, {y}', { x: last.x, y: last.y }) : t('Moved');
    }
    case 'TakeAction':
      return command.targetId === undefined
        ? t('Took the {action} action', { action: t(ACTION_WORDS[command.action]) })
        : t('Took the {action} action at {target}', {
            action: t(ACTION_WORDS[command.action]),
            target: name(command.targetId),
          });
    case 'UseReaction':
      return t(REACTION_WORDS[command.reaction]);
    case 'DeclineReaction':
      return t('Let it happen');
    case 'MakeReadiedAttack':
      return t('Made the readied attack');
    case 'SpendInspiration':
      return t('Rolled a check again with Heroic Inspiration');
    case 'UseFeature':
      // A class feature (docs/adr/0056-characters-from-the-srd.md §4), and whom it reached.
      if (command.feature === 'end-rage') return t('Ended the Rage');
      if (command.feature === 'inspiration-die') return t('Rolled a Bardic Inspiration die');
      // Wild Shape's form taken or left (§5).
      if (command.feature === 'end-wild-shape') return t('Left the Wild Shape');
      if (command.feature === 'wild-shape' && command.option !== undefined)
        return t('Took a Wild Shape: {form}', { form: readableLabel(command.option, t) });
      return command.targetId === undefined || command.targetId === command.characterId
        ? t('Used {feature}', { feature: t(RESOURCE_NAMES[command.feature]) })
        : t('Used {feature} on {target}', {
            feature: t(RESOURCE_NAMES[command.feature]),
            target: name(command.targetId),
          });
    case 'EnterLocation':
      return t('Went to {place}', { place: name(command.locationId) });
    case 'AskAbout':
      return t('Asked {npc} about {topic}', {
        npc: name(command.npcId),
        topic: name(command.topicId),
      });
    case 'ShowEvidence':
      return t('Showed evidence to {npc}', { npc: name(command.npcId) });
    case 'InsightCheck':
      return t('Read {npc} for insight', { npc: name(command.npcId) });
    case 'ExamineEntity':
      return t('Examined {target}', { target: name(command.entityId) });
    case 'FormHypothesis':
      return t('Formed a hypothesis');
    case 'EquipItem':
      return t('Put on {item}', { item: name(command.itemId) });
    case 'UnequipItem':
      return t('Took off {item}', { item: name(command.itemId) });
    case 'UseItem':
      return t('Used {item}', { item: name(command.itemId) });
    case 'GiveItem':
      return t('Gave {item} to {target}', {
        item: name(command.itemId),
        target: name(command.toHolderId),
      });
    case 'DropItem':
      return t('Dropped {item}', { item: name(command.itemId) });
    case 'TakeItem':
      return t('Picked up {item}', { item: name(command.itemId) });
  }
}

/**
 * Blockers that are a picture's hold on the step (ADR 0006 §9, `assetHoldBlockers`): the image
 * work the world finished or approved for it. The work itself is never undone (undoing an
 * approval still leaves the candidate holding), so "Undo … first" would only be refused; the
 * hold goes when the DM discards the picture (Stage 360).
 */
const PICTURE_HOLDS: ReadonlySet<KernelCommandType> = new Set([
  ...ASSET_WORKER_COMMAND_TYPES,
  'ApproveAsset',
]);

export const isPictureHold = (commandType: KernelCommandType): boolean =>
  PICTURE_HOLDS.has(commandType);

const WORLD_KIND: Readonly<Record<DmWorldEntry['change']['kind'], string>> = {
  time: 'World time',
  weather: 'Weather',
  options: 'Campaign options',
};

/** A time, weather or options change, from what it was to what it became. */
export function describeWorldChange(t: Translate, change: DmWorldEntry['change']): string {
  if (change.kind === 'options') {
    return t('Campaign options: {changes}', { changes: optionChanges(t, change.from, change.to) });
  }
  if (change.kind === 'time') {
    return t('Time: {from} → {to}', {
      from: formatWorldTime(change.from, t),
      to: formatWorldTime(change.to, t),
    });
  }
  return t('Weather at {place}: {from} → {to}', {
    place: change.location.name,
    from: change.from === null ? t('not set') : t(change.from),
    to: t(change.to),
  });
}

/**
 * The entry's heading: an authoring summary, who the DM acted as and what was done, or the
 * time or weather change.
 */
export function entryTitle(
  t: Translate,
  entry: DmHistoryEntry,
  directory: readonly EntityRef[],
): string {
  switch (entry.kind) {
    case 'authoring':
      return entry.summary;
    case 'world':
      return describeWorldChange(t, entry.change);
    case 'substitution':
      return t('Acting as {name}: {action}', {
        name: entry.character.name,
        action: describeSubstitution(t, entry.command, directory),
      });
    case 'hand':
      return describeHand(t, entry.change);
  }
}

/** The entry's details line: what kind, the DM's stated reason, and when in the world. */
export function entryDetails(t: Translate, entry: DmHistoryEntry): string {
  const kind =
    entry.kind === 'authoring'
      ? t('Authoring')
      : entry.kind === 'world'
        ? t(WORLD_KIND[entry.change.kind])
        : entry.kind === 'hand'
          ? entry.reason === null
            ? t('By hand')
            : t('By hand: “{reason}”', { reason: entry.reason })
          : entry.reason === null
            ? t('No reason was recorded')
            : entry.reason.note === null
              ? t(REASON_TEXT[entry.reason.reason])
              : t('{reason}: “{note}”', {
                  reason: t(REASON_TEXT[entry.reason.reason]),
                  note: entry.reason.note,
                });
  return `${kind} · ${formatWorldTime(entry.worldTime, t)}`;
}

/** The entry's canonical status in words. */
export function entryStatus(t: Translate, entry: DmHistoryEntry): string {
  if (entry.status === 'UNDONE') return t('Undone');
  return entry.kind === 'authoring' ? t('Added to the world') : t('In effect');
}
