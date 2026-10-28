import type { KnowledgeView, PlayerOutcome } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

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
};

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
  const base = t(REJECTIONS[code] ?? 'The world could not accept this action.');
  const reason = code === 'ILLEGAL_ACTION' && message ? readableReason(message) : null;
  return `${reason ? `${base} (${t(reason)})` : base} ${t('Your view has been refreshed.')}`;
}

/** A spell by its ID, in the form the dictionary keys it ("detect magic"). */
export const spellName = (t: Translate, id: string) => t(id.replaceAll('-', ' '));

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
    case 'MoveCombatant':
      return t('You moved to {x}, {y}.', { x: outcome.position.x, y: outcome.position.y });
    case 'Attack':
      return outcome.hit
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
    case 'CastSpell': {
      const spell = spellName(t, outcome.spellId);
      if (outcome.awaitingReaction) return t('{spell} is waiting for reactions.', { spell });
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
        ].join('');
      }
      if (outcome.discovered.length) return t('Magic revealed new evidence.');
      return outcome.spellId === 'detect-magic'
        ? t('Nothing magical was found.')
        : t('You cast {spell}.', { spell });
    }
    case 'EndTurn':
      return t('Turn ended. Round {round}.', { round: outcome.round });
    case 'UseReaction':
      return outcome.countered ? t('Counterspell stopped the spell.') : t('The reaction was used.');
    case 'DeclineReaction':
      return t('You let the spell happen.');
    default:
      return t('Action resolved. Your view has been refreshed.');
  }
}
