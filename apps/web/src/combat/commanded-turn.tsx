import type { EncounterSuggestionResponse, EncounterView } from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { useCallback, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useReservedHeight } from '../shell/reserved-height.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { CreatureActionsCard } from './creature-actions-card.tsx';
import { useCombatantLabels } from './labels.ts';
import type { MoveOption } from './move-options.ts';
import { moveLabel } from './move-words.ts';

/**
 * The turn of a creature the player's character commands (docs/adr/0044-online-play.md §7): the
 * rules' suggested act for it — one legal action by a fixed tactic, the same the DM reads — worded
 * from this player's own view (no creature named that the player does not know), with Do it and
 * End its turn; and the ways to a square the player chose on the board, as for their own
 * character — a mount goes where its rider directs (docs/adr/0049-space-and-movement.md §10); and
 * its own attacks and actions with a save, at the creature the player picks (a summoned spirit's
 * breath among them; docs/adr/0056-characters-from-the-srd.md §5). The World Engine decides each
 * as the creature's commander's.
 */
type Suggestion = NonNullable<EncounterSuggestionResponse['suggestion']>;

function suggestionWords(
  t: Translate,
  suggestion: Suggestion,
  labelOf: (id: string) => string,
): string {
  const { command } = suggestion;
  switch (command.type) {
    case 'Attack':
      return t('Attack {target}', { target: labelOf(command.targetId) });
    case 'CastSpell':
      return t('Cast a spell');
    case 'MoveCombatant':
      return t('Move closer to its foes');
    case 'EndTurn':
      return t('Nothing it can do now');
  }
}

export function CommandedTurn({
  api,
  encounter,
  actorId,
  moves = [],
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly actorId: string | null;
  /** The ways to the square chosen on the board, for the creature. */
  readonly moves?: readonly MoveOption[];
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const labelOf = useCombatantLabels(encounter);
  const current = encounter.combatants.find(
    (combatant) => combatant.entity.entityId === encounter.currentCombatantId,
  );
  const mine = actorId !== null && current?.commandedBy?.entityId === actorId;
  const turn = `${encounter.encounterId}:${String(encounter.round)}:${encounter.currentCombatantId}`;
  const load = useCallback(
    (signal: AbortSignal) =>
      mine
        ? api.get<EncounterSuggestionResponse>('encounter/suggestion', signal, false)
        : Promise.resolve({ suggestion: null }),
    [api, mine],
  );
  const read = useResource(`commanded:${turn}:${String(mine)}`, load);
  // Room kept for it below the board, as for the turn tray: no result covers its buttons.
  const tray = useReservedHeight<HTMLElement>('--tray-h', mine);
  if (!mine) return null;
  const suggestion = read.resource.status === 'ready' ? read.resource.value.suggestion : null;
  const name = labelOf(current.entity.entityId);
  return (
    <section
      ref={tray}
      className="turn-tray commanded-turn"
      aria-label={t('{name}’s turn', { name })}
    >
      <p className="commanded-turn-who">
        <Glyph name="initiative" />
        {t('{name}’s turn: you command it.', { name })}
      </p>
      {suggestion && suggestion.command.type !== 'EndTurn' && (
        <p className="muted">{suggestionWords(t, suggestion, labelOf)}</p>
      )}
      <CommandedAttack encounter={encounter} locked={locked} onRun={onRun} />
      <CreatureActionsCard encounter={encounter} locked={locked} onRun={onRun} />
      <div className="action-row">
        {moves.map((option) => (
          <button
            key={option.kind}
            type="button"
            disabled={locked}
            onClick={() => {
              onRun({
                kind: 'command',
                command: {
                  type: 'MoveCombatant',
                  combatantId: current.entity.entityId,
                  path: [...option.path],
                  ...(option.crawl ? { crawl: true } : {}),
                },
              });
            }}
          >
            {moveLabel(t, option)}
          </button>
        ))}
        {suggestion && suggestion.command.type !== 'EndTurn' && (
          <button
            type="button"
            className="primary-button"
            disabled={locked}
            onClick={() => {
              onRun({ kind: 'command', command: suggestion.command });
            }}
          >
            {t('Do it')}
          </button>
        )}
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            onRun({
              kind: 'command',
              command: { type: 'EndTurn', combatantId: current.entity.entityId },
            });
          }}
        >
          {t('End its turn')}
        </button>
      </div>
    </section>
  );
}

/** The creature's own attack, at the creature its commander's player picks. */
function CommandedAttack({
  encounter,
  locked,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const labelOf = useCombatantLabels(encounter);
  const [attackId, setAttackId] = useState('');
  const [targetId, setTargetId] = useState('');
  const current = encounter.combatants.find(
    (one) => one.entity.entityId === encounter.currentCombatantId,
  );
  const attacks = current?.attacks ?? [];
  // Foes first: the living others, those of another side before its own.
  const others = encounter.combatants
    .filter((one) => one.entity.entityId !== current?.entity.entityId && one.state !== 'dead')
    .sort((a, b) => Number(a.side === current?.side) - Number(b.side === current?.side));
  if (!current || attacks.length === 0 || others.length === 0) return null;
  const attack = attacks.find((one) => one.attackId === attackId) ?? attacks[0];
  const target = others.find((one) => one.entity.entityId === targetId) ?? others[0];
  if (!attack || !target) return null;
  return (
    <div className="commanded-attack" role="group" aria-labelledby={`${ids}-title`}>
      <p id={`${ids}-title`} className="action-choice-title">
        {t('Its attack')}
      </p>
      <div className="action-choice-fields">
        {attacks.length > 1 && (
          <Field label={t('Which attack')}>
            {(control) => (
              <select
                {...control}
                value={attack.attackId}
                onChange={(event) => {
                  setAttackId(event.target.value);
                }}
              >
                {attacks.map((one) => (
                  <option key={one.attackId} value={one.attackId}>
                    {t(one.name)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label={t('Aimed at')}>
          {(control) => (
            <select
              {...control}
              value={target.entity.entityId}
              onChange={(event) => {
                setTargetId(event.target.value);
              }}
            >
              {others.map((one) => (
                <option key={one.entity.entityId} value={one.entity.entityId}>
                  {labelOf(one.entity.entityId)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          disabled={locked}
          onClick={() => {
            onRun({
              kind: 'command',
              command: {
                type: 'Attack',
                combatantId: current.entity.entityId,
                attackId: attack.attackId,
                targetId: target.entity.entityId,
              },
            });
          }}
        >
          {t('{attack} at {target}', {
            attack: t(attack.name),
            target: labelOf(target.entity.entityId),
          })}
        </button>
      </div>
    </div>
  );
}
