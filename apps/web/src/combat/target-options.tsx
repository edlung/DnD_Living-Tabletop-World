import type { ContextAction, EncounterView, EntityContextResponse } from '@ltw/contracts';
import { StatusPanel } from '@ltw/ui';
import { useCallback, useEffect } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { combatantLabel } from './battlefield-grid.tsx';
import { combatCommandFor } from './combat-bindings.ts';

const COMBAT_ACTIONS = new Set([
  'longbow_attack',
  'fireball',
  'counterspell',
  'healing_word',
  'hunters_mark',
]);

const LABELS: Readonly<Record<string, (target: string) => string>> = {
  longbow_attack: (target) => `Attack ${target} with longbow`,
  fireball: (target) => `Cast Fireball at ${target}`,
  counterspell: () => 'Cast Counterspell',
  healing_word: (target) => `Cast Healing Word on ${target}`,
  hunters_mark: (target) => `Cast Hunter’s Mark on ${target}`,
};

const words = (text: string) => text.replaceAll('_', ' ').toLowerCase();

/**
 * Ephemeral options for one selected combatant. Everything listed here, its
 * legality, cost, distance, and the area it would affect, is the Context
 * Engine's answer for this character right now; the buttons only submit the
 * matching existing command.
 */
export function TargetOptions({
  api,
  encounter,
  targetId,
  actorId,
  canAct,
  locked,
  onRun,
  onArea,
  onClose,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly targetId: string;
  readonly actorId: string | null;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onArea: (affected: ReadonlySet<string>) => void;
  readonly onClose: () => void;
}) {
  const target = encounter.combatants.find((entry) => entry.entity.entityId === targetId);
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<EntityContextResponse>(`entities/${encodeURIComponent(targetId)}/context`, signal),
    [api, targetId],
  );
  const { resource, retry } = useResource(targetId, load);
  const actions: readonly ContextAction[] =
    resource.status === 'ready'
      ? resource.value.context.actions.filter((action) => COMBAT_ACTIONS.has(action.id))
      : [];
  const areaKey = actions
    .find((action) => action.id === 'fireball')
    ?.area?.affected.map((ref) => ref.entityId)
    .join('|');
  useEffect(() => {
    onArea(new Set(areaKey ? areaKey.split('|') : []));
    return () => {
      onArea(new Set());
    };
  }, [areaKey, onArea]);
  if (!target) return null;
  const name = combatantLabel(target);
  return (
    <section className="combat-popover" aria-label={`Options for ${name}`}>
      <div className="section-heading">
        <h3>{name}</h3>
        <button aria-label="Close options" onClick={onClose}>
          ×
        </button>
      </div>
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : 'Checking what you can do…'}
          onRetry={retry}
        />
      ) : (
        <>
          {resource.value.context.visibleState.distanceFt !== undefined && (
            <p className="muted">Distance: {resource.value.context.visibleState.distanceFt} ft</p>
          )}
          {actions.length === 0 && <p className="muted">Nothing to do with this combatant.</p>}
          <ul className="combat-options">
            {actions.map((action, index) => {
              const command =
                actorId === null
                  ? null
                  : combatCommandFor(
                      action,
                      actorId,
                      { entityId: targetId, position: target.position },
                      encounter,
                    );
              const label = (LABELS[action.id] ?? (() => words(action.id)))(name);
              const warning = action.hints?.includes('ALLY_IN_AREA') ?? false;
              return (
                <li key={`${action.id}:${index}`}>
                  <button
                    disabled={!canAct || locked || command === null}
                    onClick={() => {
                      if (command) onRun({ kind: 'command', command });
                    }}
                  >
                    {label}
                  </button>
                  {!action.legal && <small>{words(action.reason ?? 'unavailable')}</small>}
                  {action.cost && (
                    <small>
                      {action.cost.kind === 'free'
                        ? 'Free cast'
                        : `Level ${action.cost.slotLevel} slot`}
                    </small>
                  )}
                  {action.resolution?.moveRequiredFt !== undefined && (
                    <small>Move {action.resolution.moveRequiredFt} ft closer first</small>
                  )}
                  {action.hints?.includes('LONG_RANGE') && <small>long range: disadvantage</small>}
                  {action.area && (
                    <small>
                      Would affect:{' '}
                      {action.area.affected.map((ref) => ref.name ?? ref.entityId).join(', ') ||
                        'no one'}
                    </small>
                  )}
                  {warning && (
                    <strong className="ally-warning" role="alert">
                      Warning: this area includes a party member. You may still cast it.
                    </strong>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
