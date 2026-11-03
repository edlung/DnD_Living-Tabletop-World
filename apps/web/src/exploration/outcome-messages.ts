import type { KnowledgeView, PlayerOutcome } from '@ltw/contracts';
import { readableLabel, type Translate } from '@ltw/ui';

import { RESOURCE_NAMES } from '../character/feature-words.ts';
import { isSliceSpellId } from '../character/words.ts';
import { TRAP_WORDS } from '../rules/toolbox-words.ts';

/**
 * The words of what happened. Every sentence is an English key the client dictionary
 * translates (docs/adr/0031-play-language.md §10); the server's developer messages are
 * never shown.
 */
const REJECTIONS: Readonly<Record<string, string>> = {
  ALREADY_ATTEMPTED: 'This check has already been attempted.',
  NOT_PRESENT: 'That subject is no longer within reach.',
  FORBIDDEN: 'You cannot perform this action from this session.',
  ENTITY_NOT_FOUND: 'That subject is no longer available in your view.',
  REACTION_PENDING: 'The world is waiting for a reaction to resolve.',
  REACTION_WINDOW_CLOSED: 'That reaction window has already closed.',
  ALREADY_RESPONDED: 'That reaction was already answered.',
  NOT_A_CANDIDATE: 'That character cannot react to this spell.',
  NOT_YOUR_TURN: 'It is not that combatant’s turn.',
  NOT_IN_COMBAT: 'There is no encounter to act in.',
  COMBAT_ALREADY_ACTIVE: 'An encounter is already running.',
  NO_STAT_BLOCK: 'Every combatant needs a character sheet or stat block.',
  INVALID_ENCOUNTER: 'That encounter cannot be started as set up.',
  ILLEGAL_ACTION: 'This action is not available in the current world.',
  NO_EFFECT: 'This action would make no change.',
  INVALID_ITEM: 'That item cannot be handled like this right now.',
  TARGET_DEAD: 'That creature is dead.',
  NOT_A_COMBATANT: 'That creature is not in the fight.',
  INVALID_COMMAND: 'The world could not accept this as written.',
  SESSION_PAUSED: 'The DM paused the game. It waits until they resume.',
};

/** A target's defense against the damage's type (docs/adr/0048-hit-points.md §3). */
const DEFENSE_WORDS = {
  resisted: 'It resists the damage: half of it.',
  vulnerable: 'It is vulnerable to the damage: double.',
  immune: 'It is immune to the damage.',
} as const;

/** Changes of a running fight (ADR 0043 §2): a refusal is about the fight, not its start. */
const FIGHT_COMMANDS: ReadonlySet<string> = new Set([
  'AddCombatant',
  'RemoveCombatant',
  'DelayTurn',
  'SetInitiative',
]);

const ITEM_COMMANDS: ReadonlySet<string> = new Set([
  'EquipItem',
  'UnequipItem',
  'UseItem',
  'GiveItem',
  'DropItem',
  'TakeItem',
  'SplitCoins',
  'BuyItem',
  'SellItem',
  'StartCrafting',
  'AbandonCrafting',
]);

const ITEM_DONE = {
  equip: 'You put it on. Your view has been refreshed.',
  unequip: 'You took it off. Your view has been refreshed.',
  use: 'You used it. Your view has been refreshed.',
  give: 'You handed it over. Your view has been refreshed.',
  drop: 'You dropped it. Your view has been refreshed.',
  take: 'You picked it up. Your view has been refreshed.',
} as const;

/** Rules reasons arrive as a fixed vocabulary (for example `OUT_OF_RANGE`), never free text. */
const readableReason = (reason: string) =>
  /^[A-Z_]+$/.test(reason) ? reason.replaceAll('_', ' ').toLowerCase() : null;

/**
 * Whether the asker's side already holds what this NPC told about the topic: a record of the
 * party's or a character's, attributed to the NPC, about the topic. Never an NPC's own record.
 */
export const toldAbout = (
  knowledge: readonly KnowledgeView[],
  npcId: string,
  topicId: string,
): boolean =>
  knowledge.some(
    (record) =>
      record.scope.kind !== 'NPC' &&
      record.attributedTo?.entityId === npcId &&
      record.subjects.some((subject) => subject.entityId === topicId),
  );

export function rejectionMessage(
  t: Translate,
  code: string,
  message?: string,
  commandType?: string,
  /** For a question: whether this NPC told the asker's side anything about the topic before. */
  toldBefore = false,
): string {
  // Asking someone who has nothing (more) to tell is an answer, not a failure (Stage 360): the
  // server lists the question whether or not they know anything, so as not to give that away.
  // "Nothing to add" only after something was told (second stand-in pass, player 12).
  if (commandType === 'AskAbout' && code === 'NO_EFFECT') {
    return toldBefore
      ? t('They have nothing new to tell you about this.')
      : t('They have nothing to say about this.');
  }
  if (
    commandType !== undefined &&
    ITEM_COMMANDS.has(commandType) &&
    code === 'COMBAT_ALREADY_ACTIVE'
  )
    return `${t('Items cannot be handled during an encounter.')} ${t('Your view has been refreshed.')}`;
  const base =
    commandType !== undefined && FIGHT_COMMANDS.has(commandType) && code === 'INVALID_ENCOUNTER'
      ? t('The fight cannot be changed like this.')
      : t(REJECTIONS[code] ?? 'The world could not accept this action.');
  const reason = code === 'ILLEGAL_ACTION' && message ? readableReason(message) : null;
  return `${reason ? `${base} (${t(reason)})` : base} ${t('Your view has been refreshed.')}`;
}

/** A spell by its ID, in the form the dictionary keys it ("detect magic"). */
/** A slice spell's name in a sentence; any other SRD spell's, read from its id (ADR 0052). */
export const spellName = (t: Translate, id: string) =>
  isSliceSpellId(id) ? t(id.replaceAll('-', ' ')) : readableLabel(id, t);

export function outcomeMessage(t: Translate, outcome: PlayerOutcome | undefined): string {
  switch (outcome?.kind) {
    case 'EnterLocation':
      return t('You arrived. Your surroundings have been refreshed.');
    case 'AskAbout':
      return outcome.shared.length ? t('New testimony recorded.') : t('Nothing new was shared.');
    case 'ExamineEntity':
      return outcome.discovered.length
        ? t('Evidence discovered.')
        : t('No new evidence was discovered.');
    case 'ShowEvidence':
      return t('You showed the evidence. Talk or ask again to hear what they make of it.');
    case 'InsightCheck':
      return outcome.inferred.length
        ? t('An inference was recorded.')
        : t('No new inference was recorded.');
    case 'FormHypothesis':
      return t('Hypothesis recorded as HYPOTHESIS.');
    case 'Item':
      if (outcome.healed !== undefined)
        return t('You drank it: {count} hit points back.', { count: outcome.healed });
      if (outcome.chargesLeft !== undefined)
        return t('A charge spent: {count} left. The DM says what it does.', {
          count: outcome.chargesLeft,
        });
      return t(ITEM_DONE[outcome.action]);
    case 'UseFeature': {
      // A class feature (docs/adr/0056-characters-from-the-srd.md §4).
      if (outcome.feature === 'end-rage') return t('The Rage ends.');
      // Wild Shape's form (§5): taken, or left.
      if (outcome.feature === 'end-wild-shape') return t('You are yourself again.');
      if (outcome.feature === 'wild-shape')
        return outcome.left === undefined
          ? t('You take the Beast’s shape.')
          : t(
              outcome.left === 1
                ? 'You take the Beast’s shape: 1 use left.'
                : 'You take the Beast’s shape: {count} uses left.',
              { count: outcome.left },
            );
      if (outcome.feature === 'inspiration-die')
        return t(
          'Your Bardic Inspiration die shows {roll}: add it to the failed d20 test; the DM applies it.',
          { roll: outcome.rolls[0] ?? 0 },
        );
      const feature = t(RESOURCE_NAMES[outcome.feature]);
      if (outcome.healed !== undefined)
        return t('{feature}: {count} hit points back.', { feature, count: outcome.healed });
      return outcome.left === undefined
        ? t('{feature} used.', { feature })
        : t('{feature} used: {count} left.', { feature, count: outcome.left });
    }
    case 'MoveCombatant': {
      // Its height, a landing's check and a fall (docs/adr/0049-space-and-movement.md §6–8).
      const moved = t('You moved to {x}, {y}.', { x: outcome.position.x, y: outcome.position.y });
      const aloft = outcome.altitudeFt
        ? t(outcome.altitudeFt > 0 ? 'You are {feet} ft up.' : 'You are {feet} ft underground.', {
            feet: Math.abs(outcome.altitudeFt),
          })
        : null;
      const landing = outcome.landing
        ? t(
            outcome.landing.success
              ? 'Landing: Acrobatics {total}, you keep your feet.'
              : 'Landing: Acrobatics {total}, you fall Prone.',
            { total: outcome.landing.total },
          )
        : null;
      const fell = outcome.fell
        ? t('You fall {feet} ft and take {damage} damage.', { ...outcome.fell })
        : null;
      const prone =
        outcome.prone && outcome.landing?.success !== false ? t('You are Prone.') : null;
      const falling = outcome.falling ? t('You fall; a reaction may slow you.') : null;
      // A trap it came onto, and those it noticed (docs/adr/0057-encounters-maps-loot.md §6).
      const trapped = outcome.trap
        ? t('A trap springs: {name}.', { name: t(TRAP_WORDS[outcome.trap]) })
        : null;
      const noticed = outcome.noticed?.length
        ? t('You notice a trap: {name}.', {
            name: outcome.noticed.map((id) => t(TRAP_WORDS[id])).join(', '),
          })
        : null;
      return [moved, noticed, trapped, aloft, landing, fell, prone, falling]
        .filter((part) => part !== null)
        .join(' ');
    }
    case 'Attack': {
      if (outcome.awaitingReaction) return t('The attack waits for a reaction.');
      const roll = outcome.hit
        ? t(
            outcome.critical
              ? 'Critical hit: {damage} damage (attack {total}).'
              : 'Hit: {damage} damage (attack {total}).',
            {
              damage: outcome.damage ?? 0,
              total: outcome.attackTotal,
            },
          )
        : t('Miss (attack {total}).', { total: outcome.attackTotal });
      const mastery = outcome.mastery ? masteryWords(t, outcome.mastery, outcome.damage) : null;
      // What its defenses made of the damage, and a knock out (docs/adr/0048-hit-points.md).
      const defense = outcome.defense ? t(DEFENSE_WORDS[outcome.defense]) : null;
      const out = outcome.knockedOut ? t('It is knocked out.') : null;
      return [roll, defense, mastery, out].filter((part) => part !== null).join(' ');
    }
    case 'UnarmedStrike':
      if (outcome.saved) {
        return outcome.effect === 'grapple'
          ? t('Grapple: it slips your grasp.')
          : t('Shove: it stands its ground.');
      }
      return outcome.effect === 'grapple'
        ? t('Grapple: it is Grappled.')
        : outcome.shove === 'prone'
          ? t('Shove: it falls Prone.')
          : t('Shove: it is pushed 5 ft.');
    case 'CastSpell': {
      const spell = outcome.spellName ?? spellName(t, outcome.spellId);
      if (outcome.awaitingReaction) return t('{spell} is waiting for reactions.', { spell });
      // What the server does not compute of it (docs/adr/0052-spells-as-data.md §2).
      const forDm =
        outcome.forDm === 'effect'
          ? t(' The DM decides what it does.')
          : outcome.forDm === 'rest'
            ? t(' The DM applies the rest.')
            : '';
      // The dead returned to life (docs/adr/0056-characters-from-the-srd.md §5).
      if (outcome.revived && outcome.revived.length > 0)
        return `${t('{spell} returns the dead to life.', { spell })}${forDm}`;
      // The creatures it called up (§5), their names as the server gave them.
      if (outcome.summoned && outcome.summoned.length > 0)
        return `${t(
          outcome.summoned.length === 1
            ? '{spell}: {names} appears at your call.'
            : '{spell}: {names} appear at your call.',
          { spell, names: outcome.summoned.join(', ') },
        )}${forDm}`;
      if (outcome.results.length > 0) {
        const total = outcome.results.reduce((sum, entry) => sum + (entry.damage ?? 0), 0);
        const healed = outcome.results.reduce((sum, entry) => sum + (entry.healed ?? 0), 0);
        const saved = outcome.results.filter((entry) => entry.saved === true).length;
        const count = outcome.results.length;
        return [
          t(
            count === 1
              ? '{spell} resolved on {count} target'
              : '{spell} resolved on {count} targets',
            {
              spell,
              count,
            },
          ),
          saved > 0 ? t(' ({saved} saved)', { saved }) : '',
          total > 0 ? t(': {total} damage in all', { total }) : '',
          healed > 0 ? t(': {healed} healed', { healed }) : '',
          '.',
          forDm,
        ].join('');
      }
      if (outcome.discovered.length) return t('Magic revealed new evidence.');
      return outcome.spellId === 'detect-magic'
        ? t('Nothing magical was found.')
        : `${t('You cast {spell}.', { spell })}${forDm}`;
    }
    case 'EndTurn':
      return t('Turn ended. Round {round}.', { round: outcome.round });
    case 'UseReaction': {
      const { attack } = outcome;
      if (outcome.reaction === 'inspiration-reroll' && attack) {
        return attack.hit
          ? t('Rolled again: hit for {damage} damage (attack {total}).', {
              damage: attack.damage ?? 0,
              total: attack.attackTotal,
            })
          : t('Rolled again: miss (attack {total}).', { total: attack.attackTotal });
      }
      if (attack) {
        return attack.hit
          ? t('Opportunity attack: hit for {damage} damage (attack {total}).', {
              damage: attack.damage ?? 0,
              total: attack.attackTotal,
            })
          : t('Opportunity attack: miss (attack {total}).', { total: attack.attackTotal });
      }
      switch (outcome.reaction) {
        case 'shield':
          return t('Shield: the attack misses, and your AC is 5 higher until your next turn.');
        case 'uncanny-dodge':
          return t('Uncanny Dodge: you take {damage} damage.', { damage: outcome.damage ?? 0 });
        case 'hellish-rebuke':
          return t('Hellish Rebuke: {damage} fire damage.', { damage: outcome.damage ?? 0 });
        case 'feather-fall':
          return t('Feather Fall: the falling drift down and land on their feet, unharmed.');
        default:
          return outcome.countered
            ? t('Counterspell stopped the spell.')
            : t('The reaction was used.');
      }
    }
    case 'DeclineReaction':
      return outcome.trigger === 'move'
        ? t('You let it go.')
        : outcome.trigger === 'spell'
          ? t('You let the spell happen.')
          : t('You did not react.');
    case 'SplitCoins':
      return t('You shared the coins out. Your view has been refreshed.');
    case 'Trade':
      return outcome.action === 'buy'
        ? t('You bought it, and paid. Your view has been refreshed.')
        : t('You sold it, and were paid. Your view has been refreshed.');
    case 'Crafting':
      return outcome.action === 'start'
        ? t('You began the work, and paid for the materials. Your view has been refreshed.')
        : t('You gave the work up. Your view has been refreshed.');
    case 'TakeAction':
      return outcome.disarmed
        ? t('You disarm the trap: {name}.', { name: t(TRAP_WORDS[outcome.disarmed]) })
        : t('You find a trap: {name}.', {
            name: outcome.found.map((id) => t(TRAP_WORDS[id])).join(', '),
          });
    default:
      return t('Action resolved. Your view has been refreshed.');
  }
}

/** What a weapon's mastery did, after the roll's words (docs/adr/0047-weapons.md §2). */
function masteryWords(
  t: Translate,
  mastery: NonNullable<Extract<PlayerOutcome, { kind: 'Attack' }>['mastery']>,
  damage: number | null,
): string | null {
  switch (mastery.kind) {
    case 'sap':
      return t('Sap: its next attack has Disadvantage.');
    case 'vex':
      return t('Vex: your next attack against it has Advantage.');
    case 'push':
      return t('Push: it is pushed {feet} ft.', { feet: mastery.pushedFt ?? 0 });
    case 'topple':
      return mastery.toppled === true
        ? t('Topple: it falls Prone.')
        : t('Topple: it keeps its feet.');
    case 'graze':
      return t('Graze: {damage} damage.', { damage: damage ?? 0 });
    default:
      return null;
  }
}
