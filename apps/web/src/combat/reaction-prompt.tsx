import type { EncounterView, EntityContextResponse } from '@ltw/contracts';
import { StatusPanel } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { combatCommandFor, ignoreReaction } from './combat-bindings.ts';

/**
 * The reaction question, shown only to a character the open window asks. The
 * window's lifecycle (open, answered, closed by the DM) belongs to the domain:
 * a stale answer is refused there and this prompt simply reloads.
 */
export function ReactionPrompt({
  api,
  encounter,
  actorId,
  canAct,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly actorId: string;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const window = encounter.reactionWindow;
  const casterId = window?.trigger.caster.entityId ?? '';
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<EntityContextResponse>(`entities/${encodeURIComponent(casterId)}/context`, signal),
    [api, casterId],
  );
  const { resource, retry } = useResource(`${casterId}:${window?.windowId ?? ''}`, load);
  if (!window || window.choices.length === 0) return null;
  const caster = window.trigger.caster.name ?? window.trigger.caster.entityId;
  const counter =
    resource.status === 'ready'
      ? resource.value.context.actions.find((action) => action.id === 'counterspell')
      : undefined;
  const target = encounter.combatants.find((entry) => entry.entity.entityId === casterId);
  const command =
    counter && target
      ? combatCommandFor(
          counter,
          actorId,
          { entityId: casterId, position: target.position },
          encounter,
        )
      : null;
  return (
    <section className="reaction-prompt" role="alertdialog" aria-label="Reaction">
      <h3>{caster} is casting a spell</h3>
      <p>Components: {window.trigger.components.join(', ')}. The spell waits until you answer.</p>
      {resource.status === 'loading' && (
        <StatusPanel state="loading" label="Checking Counterspell…" />
      )}
      {resource.status === 'error' && (
        <StatusPanel state="error" label={resource.message} onRetry={retry} />
      )}
      <div className="action-row">
        {window.choices.includes('counterspell') && (
          <button
            disabled={!canAct || locked || command === null}
            onClick={() => {
              if (command) onRun({ kind: 'command', command });
            }}
          >
            Cast Counterspell
          </button>
        )}
        {window.choices.includes('ignore') && (
          <button
            disabled={!canAct || locked}
            onClick={() => {
              onRun({ kind: 'command', command: ignoreReaction(actorId, window.windowId) });
            }}
          >
            Ignore
          </button>
        )}
      </div>
      <p className="muted">
        Counterspell spends a spell slot and may stop the spell. Ignore lets the spell happen.
      </p>
      {counter && !counter.legal && (
        <small>
          Counterspell unavailable: {(counter.reason ?? '').replaceAll('_', ' ').toLowerCase()}
        </small>
      )}
      {counter?.cost?.kind === 'slot' && <small>Uses a level {counter.cost.slotLevel} slot.</small>}
    </section>
  );
}
