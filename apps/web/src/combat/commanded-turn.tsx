import type {
  EncounterCombatantView,
  EncounterSuggestionResponse,
  EncounterView,
} from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useReservedHeight } from '../shell/reserved-height.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useCombatantLabels } from './labels.ts';
import type { MoveOption } from './move-options.ts';
import { moveLabel } from './move-words.ts';

/**
 * The turn of a creature the player's character commands (docs/adr/0044-online-play.md §7): the
 * rules' suggested act for it — one legal action by a fixed tactic, the same the DM reads — worded
 * from this player's own view (no creature named that the player does not know), with Do it and
 * End its turn; and the ways to a square the player chose on the board, as for their own
 * character — a mount goes where its rider directs (docs/adr/0049-space-and-movement.md §10); and
 * its own attacks and actions with a save at the creature the player chose on the board, as for
 * their own turn (a summoned spirit's breath among them; docs/adr/0056-characters-from-the-srd.md
 * §5). The World Engine decides each as the creature's commander's.
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
  target = null,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly actorId: string | null;
  /** The ways to the square chosen on the board, for the creature. */
  readonly moves?: readonly MoveOption[];
  /** The creature chosen on the board: the one its attacks and actions go at. */
  readonly target?: EncounterCombatantView | null;
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
  // Its attacks and actions with a save at the creature chosen on the board (ADR 0056 §5).
  const at =
    target && target.entity.entityId !== current.entity.entityId && target.state !== 'dead'
      ? target
      : null;
  const aimed = at === null ? [] : commandsAt(t, current, at, labelOf(at.entity.entityId));
  const pickable = (current.attacks?.length ?? 0) + (current.creatureActions?.length ?? 0) > 0;
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
      {pickable && at === null && (
        <p className="muted">{t('Choose a creature on the board for its attacks.')}</p>
      )}
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
        {aimed.map((one) => (
          <button
            key={one.key}
            type="button"
            disabled={locked || !one.ready}
            onClick={() => {
              onRun({ kind: 'command', command: one.command });
            }}
          >
            {one.label}
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

interface Aimed {
  readonly key: string;
  readonly label: string;
  readonly ready: boolean;
  readonly command: Extract<ExplorationIntent, { kind: 'command' }>['command'];
}

/** The creature's attacks and actions with a save, each at the chosen creature. */
function commandsAt(
  t: Translate,
  current: EncounterCombatantView,
  target: EncounterCombatantView,
  targetName: string,
): Aimed[] {
  const combatantId = current.entity.entityId;
  const targetId = target.entity.entityId;
  return [
    ...(current.attacks ?? []).map((attack) => ({
      key: `attack:${attack.attackId}`,
      label: t('{attack} at {target}', { attack: t(attack.name), target: targetName }),
      ready: true,
      command: { type: 'Attack' as const, combatantId, attackId: attack.attackId, targetId },
    })),
    ...(current.creatureActions ?? []).map((action) => ({
      key: `action:${action.actionId}`,
      label: t('{attack} at {target}', { attack: t(action.name), target: targetName }),
      ready: action.ready,
      command: {
        type: 'UseCreatureAction' as const,
        combatantId,
        actionId: action.actionId,
        // A breath toward the creature's square, any other action at the creature.
        ...(action.aim === 'square'
          ? { point: { x: target.position.x, y: target.position.y } }
          : { targetId }),
      },
    })),
  ];
}
