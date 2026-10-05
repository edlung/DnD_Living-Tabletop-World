import type { PlayerOutcome } from '@ltw/contracts';

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

export function rejectionMessage(code: string, message?: string): string {
  const base = REJECTIONS[code] ?? 'The world could not accept this action.';
  const reason = code === 'ILLEGAL_ACTION' && message ? readableReason(message) : null;
  return `${reason ? `${base} (${reason})` : base} Your view has been refreshed.`;
}

const spellName = (id: string) => id.replaceAll('-', ' ');

export function outcomeMessage(outcome: PlayerOutcome | undefined): string {
  switch (outcome?.kind) {
    case 'EnterLocation':
      return 'You arrived. Your surroundings have been refreshed.';
    case 'AskAbout':
      return outcome.shared.length ? 'New testimony recorded.' : 'Nothing new was shared.';
    case 'ExamineEntity':
      return outcome.discovered.length ? 'Evidence discovered.' : 'No new evidence was discovered.';
    case 'ShowEvidence':
      return 'You showed the evidence. The conversation may have new leads.';
    case 'InsightCheck':
      return outcome.inferred.length
        ? 'An inference was recorded.'
        : 'No new inference was recorded.';
    case 'FormHypothesis':
      return 'Hypothesis recorded as HYPOTHESIS.';
    case 'MoveCombatant':
      return `You moved to ${String(outcome.position.x)}, ${String(outcome.position.y)}.`;
    case 'Attack':
      return outcome.hit
        ? `${outcome.critical ? 'Critical hit' : 'Hit'}: ${String(outcome.damage ?? 0)} damage (attack ${String(outcome.attackTotal)}).`
        : `Miss (attack ${String(outcome.attackTotal)}).`;
    case 'CastSpell':
      if (outcome.awaitingReaction) {
        return `${spellName(outcome.spellId)} is waiting for reactions.`;
      }
      if (outcome.results.length > 0) {
        const total = outcome.results.reduce((sum, entry) => sum + (entry.damage ?? 0), 0);
        const healed = outcome.results.reduce((sum, entry) => sum + (entry.healed ?? 0), 0);
        const saved = outcome.results.filter((entry) => entry.saved === true).length;
        const count = outcome.results.length;
        return `${spellName(outcome.spellId)} resolved on ${String(count)} ${count === 1 ? 'target' : 'targets'}${
          saved > 0 ? ` (${String(saved)} saved)` : ''
        }${total > 0 ? `: ${String(total)} damage in all` : ''}${healed > 0 ? `: ${String(healed)} healed` : ''}.`;
      }
      if (outcome.discovered.length) return 'Magic revealed new evidence.';
      return outcome.spellId === 'detect-magic'
        ? 'Nothing magical was found.'
        : `You cast ${spellName(outcome.spellId)}.`;
    case 'EndTurn':
      return `Turn ended. Round ${String(outcome.round)}.`;
    case 'UseReaction':
      return outcome.countered ? 'Counterspell stopped the spell.' : 'The reaction was used.';
    case 'DeclineReaction':
      return 'You let the spell happen.';
    default:
      return 'Action resolved. Your view has been refreshed.';
  }
}
