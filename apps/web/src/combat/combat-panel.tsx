import type { EncounterView, Square } from '@ltw/contracts';
import { useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { BattlefieldGrid, combatantLabel } from './battlefield-grid.tsx';
import { squareLabel } from './combat-bindings.ts';
import { planPath } from './movement.ts';
import { ReactionPrompt } from './reaction-prompt.tsx';
import { TargetOptions } from './target-options.tsx';

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
    <section className="combat-panel" aria-label="Battlefield">
      <div className="combat-anchor" role="status" aria-label="Encounter anchor">
        <span>Round {encounter.round}</span>
        <span>Turn: {current ? combatantLabel(current) : encounter.currentCombatantId}</span>
        {self?.hitPoints && (
          <span>
            You: {self.hitPoints.current} / {self.hitPoints.max} HP
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
            End turn
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
          Waiting for reactions to resolve.
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
        Shaded squares are difficult terrain; outlined squares give cover. Select a square to move
        or a combatant to act.
      </p>
      {focus?.kind === 'combatant' && (
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
        <section className="combat-popover" aria-label="Move options">
          <div className="section-heading">
            <h3>Square {squareLabel(focus.square)}</h3>
            <button
              aria-label="Close options"
              onClick={() => {
                setFocus(null);
              }}
            >
              ×
            </button>
          </div>
          {!myTurn && <p className="muted">You can move on your own turn.</p>}
          {plan ? (
            <p className="muted">
              Route: {plan.path.length} {plan.path.length === 1 ? 'square' : 'squares'}, about{' '}
              {plan.costFt} ft. The rules confirm your speed.
            </p>
          ) : (
            <p className="muted">No open route to this square.</p>
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
            Move here
          </button>
        </section>
      )}
    </section>
  );
}
