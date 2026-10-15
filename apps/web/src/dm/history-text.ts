import type {
  DmHistoryEntry,
  DmSubstitutionEntry,
  EntityRef,
  KernelCommandType,
  SubstitutionReason,
} from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import { nameFor } from '../authoring/command-text.ts';
import { spellName } from '../exploration/outcome-messages.ts';
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

/** A command type as a step the DM can name: blockers and undo actions. */
export const STEP_TEXT: Readonly<Record<KernelCommandType, string>> = {
  CreateCampaign: 'create campaign',
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
  GenerateChronicle: 'generate chronicle',
};

/** What the DM did for the character, in plain words. */
export function describeSubstitution(
  t: Translate,
  command: DmSubstitutionEntry['command'],
  directory: readonly EntityRef[],
): string {
  const name = (id: string) => nameFor(directory, id);
  switch (command.type) {
    case 'EndTurn':
      return t('Ended the turn');
    case 'Attack':
      return t('Attacked {target}', { target: name(command.targetId) });
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
    case 'UseReaction':
      return t('Cast Counterspell as a reaction');
    case 'DeclineReaction':
      return t('Let the spell happen');
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
  }
}

/** The entry's heading: an authoring summary, or who the DM acted as and what was done. */
export function entryTitle(
  t: Translate,
  entry: DmHistoryEntry,
  directory: readonly EntityRef[],
): string {
  return entry.kind === 'authoring'
    ? entry.summary
    : t('Acting as {name}: {action}', {
        name: entry.character.name,
        action: describeSubstitution(t, entry.command, directory),
      });
}

/** The entry's details line: what kind, the DM's stated reason, and when in the world. */
export function entryDetails(t: Translate, entry: DmHistoryEntry): string {
  const kind =
    entry.kind === 'authoring'
      ? t('Authoring')
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
