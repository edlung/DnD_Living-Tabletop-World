import type { EncounterView, Square } from '@ltw/contracts';
import { useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { BattlefieldGrid, combatantLabel } from './battlefield-grid.tsx';
import { squareLabel } from './combat-bindings.ts';
import { planPath } from './movement.ts';
import { ReactionPrompt } from './reaction-prompt.tsx';
import { TargetOptions } from './target-options.tsx';
import { useT } from '@ltw/ui';

type Focus =
  | { readonly kind: 'square'; readonly square: Square }
  | { readonly kind: 'combatant'; readonly id: string };

/**
 * The persistent battlefield with a minimal anchor strip (round, turn, own
 * health, End turn on your own turn). Everything else is ephemeral: choosing
 * a square or combatant opens its options, and acting dismisses them. No
 * permanent action bar exists. `actorId` is null for the DM.
 */
export function CombatPanel({
  api,
  encounter,
  actorId,
  canAct,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly actorId: string | null;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const [focus, setFocus] = useState<Focus | null>(null);
  const [affected, setAffected] = useState<ReadonlySet<string>>(new Set());
  const self = encounter.combatants.find((entry) => entry.entity.entityId === actorId);
  const current = encounter.combatants.find(
    (entry) => entry.entity.entityId === encounter.currentCombatantId,
  );
  const myTurn = self !== undefined && encounter.currentCombatantId === actorId;
  const waiting = encounter.reactionWindow !== null;
  const plan =
    focus?.kind === 'square' && actorId !== null
      ? planPath(encounter, actorId, focus.square)
      : null;
  const pick = (square: Square) => {
    const occupant = encounter.combatants.find(
      (entry) => entry.position.x === square.x && entry.position.y === square.y,
    );
    setFocus(
      occupant ? { kind: 'combatant', id: occupant.entity.entityId } : { kind: 'square', square },
    );
  };
  const selectedSquare =
    focus?.kind === 'square'
      ? focus.square
      : focus?.kind === 'combatant'
        ? (encounter.combatants.find((entry) => entry.entity.entityId === focus.id)?.position ??
          null)
        : null;
  return (
    <section className="combat-panel" aria-label={t('Battlefield')}>
      <div className="combat-anchor" role="status" aria-label={t('Encounter anchor')}>
        <span>{t('Round {round}', { round: encounter.round })}</span>
        <span>
          {t('Turn: {name}', {
            name: current ? combatantLabel(current) : encounter.currentCombatantId,
          })}
        </span>
        {self?.hitPoints && (
          <span>
            {t('You: {current} / {max} HP', {
              current: self.hitPoints.current,
              max: self.hitPoints.max,
            })}
          </span>
        )}
        {self && !myTurn && !waiting && (
          <span className="muted">
            {t('Waiting for {name}; the DM runs creature turns.', {
              name: current ? combatantLabel(current) : t('the next turn'),
            })}
          </span>
        )}
        {myTurn && !waiting && canAct && (
          <button
            disabled={locked}
            onClick={() => {
              if (actorId) {
                onRun({ kind: 'command', command: { type: 'EndTurn', combatantId: actorId } });
              }
            }}
          >
            {t('End turn')}
          </button>
        )}
      </div>
      {actorId !== null && waiting && (
        <ReactionPrompt
          api={api}
          encounter={encounter}
          actorId={actorId}
          canAct={canAct}
          locked={locked}
          onRun={onRun}
        />
      )}
      {waiting && actorId !== null && encounter.reactionWindow.choices.length === 0 && (
        <p className="muted" role="status">
          {t('Waiting for reactions to resolve.')}
        </p>
      )}
      <BattlefieldGrid
        encounter={encounter}
        selfId={actorId}
        selected={selectedSquare}
        path={plan?.path ?? []}
        affected={affected}
        onPick={pick}
      />
      <p className="battlefield-legend muted">
        {t(
          'Shaded squares are difficult terrain; outlined squares give cover. Select a square to move or a combatant to act.',
        )}
      </p>
      {focus?.kind === 'combatant' && actorId === null && (
        <section className="combat-popover" aria-label={t('Combatant')}>
          <p>
            {(() => {
              const picked = encounter.combatants.find(
                (entry) => entry.entity.entityId === focus.id,
              );
              return picked
                ? `${combatantLabel(picked)} · ${t(picked.side)} · ${t(picked.state)}`
                : '';
            })()}
          </p>
          <p className="muted">
            {t('The DM acts for creatures with the encounter controls above (suggested turn).')}
          </p>
        </section>
      )}
      {focus?.kind === 'combatant' && actorId !== null && (
        <TargetOptions
          key={focus.id}
          api={api}
          encounter={encounter}
          targetId={focus.id}
          actorId={actorId}
          canAct={canAct && !waiting}
          locked={locked}
          onRun={onRun}
          onArea={setAffected}
          onClose={() => {
            setFocus(null);
          }}
        />
      )}
      {focus?.kind === 'square' && actorId !== null && (
        <section className="combat-popover" aria-label={t('Move options')}>
          <div className="section-heading">
            <h3>Square {squareLabel(focus.square)}</h3>
            <button
              aria-label={t('Close options')}
              onClick={() => {
                setFocus(null);
              }}
            >
              ×
            </button>
          </div>
          {!myTurn && <p className="muted">{t('You can move on your own turn.')}</p>}
          {plan ? (
            <p className="muted">
              {t(
                plan.path.length === 1
                  ? 'Route: {count} square, about {feet} ft. The rules confirm your speed.'
                  : 'Route: {count} squares, about {feet} ft. The rules confirm your speed.',
                { count: plan.path.length, feet: plan.costFt },
              )}
            </p>
          ) : (
            <p className="muted">{t('No open route to this square.')}</p>
          )}
          <button
            disabled={!canAct || locked || !myTurn || waiting || !plan}
            onClick={() => {
              if (plan) {
                onRun({
                  kind: 'command',
                  command: { type: 'MoveCombatant', combatantId: actorId, path: [...plan.path] },
                });
              }
            }}
          >
            {t('Move here')}
          </button>
        </section>
      )}
    </section>
  );
}
