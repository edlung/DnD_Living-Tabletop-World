import type {
  EncounterSuggestionResponse,
  EncounterView,
  EntityRef,
  ScenePresentationResponse,
} from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import type { CombatUiCommand } from './combat-bindings.ts';
import type { StandIn } from './stand-in.ts';
import { StandInControls } from './stand-in-controls.tsx';

const FIELD = { width: 16, height: 12 } as const;

type Side = 'party' | 'hostile' | 'neutral';

/** Open ground: party on the left edge, everyone else on the right, one per row. */
export function openGroundStart(
  chosen: readonly { readonly entityId: string; readonly side: Side }[],
): Extract<CombatUiCommand, { type: 'StartCombat' }>['combatants'] {
  const rows = { party: 0, hostile: 0, neutral: 0 };
  return chosen.map(({ entityId, side }) => {
    const row = rows[side];
    rows[side] += 1;
    const x = side === 'party' ? 2 : side === 'hostile' ? FIELD.width - 5 : FIELD.width / 2;
    return { entityId, side, position: { x, y: 1 + row * 2 } };
  });
}

/**
 * The DM's existing combat operations, offered only where they apply: start an
 * encounter from the scene, end it, close an open reaction window, run the
 * suggested monster turn (the exact command the server proposes), and skip a
 * player's turn or act as that character (ADR 0033 §6). Nothing here acts by
 * itself and no panel of actions stays on screen otherwise.
 */
export function DmCombatControls({
  api,
  encounter,
  locationId,
  directory,
  locked,
  onRun,
  onActAs,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView | null;
  readonly locationId: string;
  readonly directory: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onActAs: (standIn: StandIn) => void;
}) {
  const t = useT();
  return (
    <details className="disclosure dm-combat" open={encounter !== null}>
      <summary>{encounter ? t('Encounter controls (DM)') : t('Start an encounter (DM)')}</summary>
      {encounter ? (
        <>
          <RunningControls api={api} encounter={encounter} locked={locked} onRun={onRun} />
          <StandInControls
            api={api}
            encounter={encounter}
            locked={locked}
            onRun={onRun}
            onActAs={onActAs}
          />
        </>
      ) : (
        <StartControls
          api={api}
          locationId={locationId}
          directory={directory}
          locked={locked}
          onRun={onRun}
        />
      )}
    </details>
  );
}

function StartControls({
  api,
  locationId,
  directory,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly locationId: string;
  readonly directory: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<ScenePresentationResponse>(
        `locations/${encodeURIComponent(locationId)}/scene`,
        signal,
      ),
    [api, locationId],
  );
  const { resource, retry } = useResource(locationId, load);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status}
        label={resource.status === 'error' ? resource.message : t('Looking at who is here…')}
        onRetry={retry}
      />
    );
  const fighters = resource.value.present.filter(
    (entity) => entity.kind === 'character' || entity.kind === 'creature',
  );
  const chosen = fighters
    .filter((entity) => !skipped.has(entity.entityId))
    .map((entity) => ({
      entityId: entity.entityId,
      side: entity.kind === 'character' ? ('party' as const) : ('hostile' as const),
    }));
  const nameOf = (id: string) => directory.find((entity) => entity.entityId === id)?.name ?? id;
  return (
    <div>
      <p className="muted">
        {t(
          'Characters join the party and creatures are hostile, on open ground. Initiative is rolled by the rules.',
        )}
      </p>
      <ul className="combat-options">
        {fighters.map((entity) => (
          <li key={entity.entityId}>
            <label>
              <input
                type="checkbox"
                checked={!skipped.has(entity.entityId)}
                onChange={(event) => {
                  setSkipped((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.delete(entity.entityId);
                    else next.add(entity.entityId);
                    return next;
                  });
                }}
              />{' '}
              {nameOf(entity.entityId)} ({entity.kind === 'character' ? 'party' : 'hostile'})
            </label>
          </li>
        ))}
      </ul>
      <button
        disabled={locked || chosen.length < 2}
        onClick={() => {
          onRun({
            kind: 'command',
            command: {
              type: 'StartCombat',
              locationId,
              battlefield: { ...FIELD, difficult: [], cover: [] },
              combatants: openGroundStart(chosen),
            },
          });
        }}
      >
        {t('Start encounter')}
      </button>
    </div>
  );
}

function RunningControls({
  api,
  encounter,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const window = encounter.reactionWindow;
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<EncounterSuggestionResponse>('encounter/suggestion', signal, false),
    [api],
  );
  const { resource } = useResource(
    `${encounter.encounterId}:${String(encounter.round)}:${encounter.currentCombatantId}:${window?.windowId ?? ''}`,
    load,
  );
  const suggestion = resource.status === 'ready' ? resource.value.suggestion : null;
  return (
    <div className="action-row">
      {window && (
        <button
          disabled={locked}
          onClick={() => {
            onRun({
              kind: 'command',
              command: { type: 'CloseReactionWindow', windowId: window.windowId },
            });
          }}
        >
          {t('Close reaction window')}
        </button>
      )}
      {suggestion && !window && (
        <div className="monster-suggestion">
          <p>
            <strong>{t('Suggested turn:')}</strong> {suggestion.explanation}
          </p>
          <button
            disabled={locked}
            onClick={() => {
              onRun({ kind: 'command', command: suggestion.command });
            }}
          >
            {t('Run suggested {tactic}', { tactic: t(suggestion.tactic.replace('-', ' ')) })}
          </button>
        </div>
      )}
      {confirmingEnd ? (
        <>
          <span>{t('End the encounter for everyone?')}</span>
          <button
            disabled={locked}
            onClick={() => {
              onRun({
                kind: 'command',
                command: { type: 'EndCombat', encounterId: encounter.encounterId },
              });
            }}
          >
            {t('Yes, end encounter')}
          </button>
          <button
            onClick={() => {
              setConfirmingEnd(false);
            }}
          >
            {t('Keep fighting')}
          </button>
        </>
      ) : (
        <button
          disabled={locked}
          onClick={() => {
            setConfirmingEnd(true);
          }}
        >
          {t('End encounter')}
        </button>
      )}
    </div>
  );
}
