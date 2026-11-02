import type { EncounterView, ReactionWindowView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';
import { ignoreReaction, opportunityAttack } from './combat-bindings.ts';
import { useCombatantLabels } from './labels.ts';
import { attackWords } from './opportunity-prompt.tsx';

/**
 * The open reaction window in the DM's Encounter sheet (docs/adr/0016-reaction-engine.md §4;
 * docs/adr/0046-reactions-beyond-counterspell.md §1): what waits — a spell, or a move out of reach
 * — the creatures the DM answers for (an opportunity attack with one of their melee attacks, or
 * let it go), the characters whose players are asked, and the close that lets it go on.
 */
export function DmReactionWindow({
  encounter,
  window,
  locked,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly window: ReactionWindowView;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const labelOf = useCombatantLabels(encounter);
  const run = (command: Extract<ExplorationIntent, { kind: 'command' }>['command']) => {
    onRun({ kind: 'command', command });
  };
  const { trigger } = window;
  const kindOf = (entityId: string) =>
    encounter.combatants.find((c) => c.entity.entityId === entityId)?.entity.kind;
  return (
    <div className="tool-card tool-card--reaction">
      <p>
        <Glyph name="reaction" />
        {trigger.kind === 'spell'
          ? t('Spell resolution is waiting for reactions.')
          : t("{mover}'s move is waiting for opportunity attacks.", {
              mover: trigger.mover.name ?? labelOf(trigger.mover.entityId),
            })}
      </p>
      {trigger.kind === 'move' && (
        <ul className="reaction-answers">
          {window.candidates.map((candidate) => {
            const who = labelOf(candidate.entityId);
            const answering =
              candidate.response === 'pending' && kindOf(candidate.entityId) !== 'character';
            return (
              <li key={candidate.entityId}>
                <strong>{who}</strong>
                {candidate.response !== 'pending' ? (
                  <span className="muted">{t(answerWords[candidate.response])}</span>
                ) : !answering ? (
                  <span className="muted">{t('Waiting for the player')}</span>
                ) : (
                  <span className="action-row">
                    {(candidate.attacks ?? []).map((option) => (
                      <button
                        key={option.attackId}
                        type="button"
                        disabled={locked}
                        aria-label={t('{who}: opportunity attack with {attack}', {
                          who,
                          attack: attackWords(t, option),
                        })}
                        onClick={() => {
                          run(
                            opportunityAttack(candidate.entityId, window.windowId, option.attackId),
                          );
                        }}
                      >
                        <Glyph name="opportunity-attack" />
                        {attackWords(t, option)}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={locked}
                      aria-label={t('{who}: let it go', { who })}
                      onClick={() => {
                        run(ignoreReaction(candidate.entityId, window.windowId));
                      }}
                    >
                      {t('Let it go')}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          run({ type: 'CloseReactionWindow', windowId: window.windowId });
        }}
      >
        <Glyph name="close" />
        {t('Close reaction window')}
      </button>
    </div>
  );
}

const answerWords = {
  used: 'Attacked',
  declined: 'Let it go',
  expired: 'No answer',
  pending: 'Waiting',
} as const;

/**
 * The attacks readied in the fight (docs/adr/0045-conditions-and-actions.md §5), for the DM: who
 * holds what at whom and when; a creature's the DM makes when its moment comes, a character's its
 * player makes (ADR 0046 §5).
 */
export function DmReadiedList({
  encounter,
  locked,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const labelOf = useCombatantLabels(encounter);
  const readied = encounter.combatants.filter((c) => c.readied !== undefined);
  if (readied.length === 0) return null;
  return (
    <div className="tool-card readied-list">
      <p>
        <Glyph name="ready" />
        <strong>{t('Readied attacks')}</strong>
      </p>
      <ul>
        {readied.map((combatant) => {
          const held = combatant.readied;
          if (!held) return null;
          const who = labelOf(combatant.entity.entityId);
          const ownTurn = combatant.entity.entityId === encounter.currentCombatantId;
          return (
            <li key={combatant.entity.entityId}>
              <span>
                {t('{who}: {attack} at {target} (“{trigger}”)', {
                  who,
                  attack: attackWords(t, { attackId: held.attackId, name: null }),
                  target: held.target.name ?? labelOf(held.target.entityId),
                  trigger: held.trigger,
                })}
              </span>
              {combatant.entity.kind !== 'character' && !ownTurn && (
                <button
                  type="button"
                  disabled={locked}
                  aria-label={t('{who}: make the readied attack', { who })}
                  onClick={() => {
                    onRun({
                      kind: 'command',
                      command: {
                        type: 'MakeReadiedAttack',
                        combatantId: combatant.entity.entityId,
                      },
                    });
                  }}
                >
                  {t('Make the readied attack')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
