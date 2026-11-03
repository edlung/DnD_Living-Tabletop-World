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
import { withPictureTimes } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { LightControl } from './light-control.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { catalogUrl } from '../visual/ui-kit.ts';
import { suggestionArt } from './combat-art.ts';
import { CreatureActionsCard, DifficultyLine, LegendaryCard } from './creature-actions-card.tsx';
import type { CombatUiCommand } from './combat-bindings.ts';
import { DmReactionWindow, DmReadiedList } from './dm-reaction-window.tsx';
import type { StandIn } from './stand-in.ts';
import { PreparedEncounters } from './prepared-encounters.tsx';
import { SavedEncounters } from './saved-encounters.tsx';
import { StandInControls } from './stand-in-controls.tsx';
import { SurpriseChoice, type SurpriseValue } from './surprise-choice.tsx';
import { TurnOrderControls } from './turn-order-controls.tsx';

const FIELD = { width: 16, height: 12 } as const;

type Side = 'party' | 'hostile' | 'neutral';

/**
 * Open ground: party on the left edge, everyone else on the right, one per row, every other row;
 * a side that fills its column goes on in the next one, away from the middle (Stage 605: the
 * party's four meet eleven foes).
 */
export function openGroundStart(
  chosen: readonly { readonly entityId: string; readonly side: Side }[],
  field: { readonly width: number; readonly height: number } = FIELD,
): Extract<CombatUiCommand, { type: 'StartCombat' }>['combatants'] {
  // Squares one column holds, every other row from the top.
  const perColumn = Math.floor((field.height + 1) / 2);
  const placed = { party: 0, hostile: 0, neutral: 0 };
  return chosen.map(({ entityId, side }) => {
    const index = placed[side];
    placed[side] += 1;
    const column = Math.floor(index / perColumn);
    const row = index % perColumn;
    const x =
      side === 'party'
        ? Math.max(0, 2 - column)
        : side === 'hostile'
          ? Math.min(field.width - 1, field.width - 5 + column)
          : Math.floor(field.width / 2) + column;
    return { entityId, side, position: { x, y: 1 + row * 2 } };
  });
}

/**
 * The DM's existing combat operations, in the Encounter sheet (docs/STAGE_320_DESIGN.md §5.5),
 * offered only where they apply: start an encounter from the scene, end it, close an open
 * reaction window, run the suggested monster turn (the exact command the server proposes), and
 * skip a player's turn or act as that character (ADR 0033 §6). Nothing here acts by itself.
 */
export function DmCombatControls({
  api,
  encounter,
  locationId,
  directory,
  locked,
  onRun,
  onActAs,
  onWorldChanged,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView | null;
  readonly locationId: string;
  readonly directory: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onActAs: (standIn: StandIn) => void;
  /** The world is read again (a prepared encounter started on the server). */
  readonly onWorldChanged: () => void;
}) {
  const t = useT();
  return (
    <section className="dm-combat" aria-labelledby="dm-combat-title">
      <h3 id="dm-combat-title">
        <Glyph name="encounter" />
        {encounter ? t('Encounter controls (DM)') : t('Start an encounter (DM)')}
      </h3>
      {encounter ? (
        <>
          <RunningControls
            api={api}
            encounter={encounter}
            directory={directory}
            locked={locked}
            onRun={onRun}
          />
          <StandInControls
            api={api}
            encounter={encounter}
            locked={locked}
            onRun={onRun}
            onActAs={onActAs}
          />
        </>
      ) : (
        <>
          <PreparedEncounters api={api} locked={locked} onStarted={onWorldChanged} />
          <SavedEncounters
            api={api}
            locationId={locationId}
            directory={directory}
            locked={locked}
            onStarted={onWorldChanged}
          />
          <StartControls
            api={api}
            locationId={locationId}
            directory={directory}
            locked={locked}
            onRun={onRun}
          />
        </>
      )}
    </section>
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
      api
        .get<ScenePresentationResponse>(`locations/${encodeURIComponent(locationId)}/scene`, signal)
        .then(withPictureTimes),
    [api, locationId],
  );
  const { resource, retry } = useResource(locationId, load);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [surprised, setSurprised] = useState<SurpriseValue>('none');
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status}
        label={resource.status === 'error' ? resource.message : t('Looking at who is here…')}
        onRetry={retry}
      />
    );
  // A battle map whose grid the DM lined up gives the fight its columns and rows (ADR 0057 §3).
  const grid = resource.value.location.battleMap?.grid;
  const field = grid ? { width: grid.columns, height: grid.rows } : FIELD;
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
    <div className="encounter-start">
      <h4>{t('A fight with who is here')}</h4>
      <p className="muted">
        {t(
          'Characters join the party and creatures are hostile, on open ground. Initiative is rolled by the rules.',
        )}
      </p>
      {grid && (
        <p className="muted">
          {t('On the place’s battle map: {columns} × {rows} squares.', {
            columns: grid.columns,
            rows: grid.rows,
          })}
        </p>
      )}
      <ul className="fighter-list">
        {fighters.map((entity) => {
          const side = entity.kind === 'character' ? 'party' : 'hostile';
          return (
            <li key={entity.entityId}>
              <label className="fighter">
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
                />
                <Medallion image={entity.image} kind={entity.kind} size="xs" tone={side} />
                <span className="fighter-name">{nameOf(entity.entityId)}</span>
                <span className={`side-chip side-chip--${side}`}>{t(side)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <SurpriseChoice value={surprised} disabled={locked} onChange={setSurprised} />
      <button
        className="primary-button"
        disabled={locked || chosen.length < 2}
        onClick={() => {
          // The side the DM names is surprised: its Initiative has Disadvantage (ADR 0045 §5).
          const side = surprised === 'foes' ? 'hostile' : surprised;
          onRun({
            kind: 'command',
            command: {
              type: 'StartCombat',
              locationId,
              battlefield: { ...field, difficult: [], cover: [] },
              combatants: openGroundStart(chosen, field).map((combatant) =>
                combatant.side === side ? { ...combatant, surprised: true } : combatant,
              ),
            },
          });
        }}
      >
        <Glyph name="encounter" />
        {t('Start encounter')}
      </button>
    </div>
  );
}

function RunningControls({
  api,
  encounter,
  directory,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly directory: readonly EntityRef[];
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
  const art = suggestion ? suggestionArt(suggestion.command) : null;
  const artUrl = art ? catalogUrl(art.kind, art.id) : null;
  return (
    <div className="encounter-tools">
      {window && (
        <DmReactionWindow encounter={encounter} window={window} locked={locked} onRun={onRun} />
      )}
      {suggestion && !window && (
        <div className="tool-card monster-suggestion">
          {artUrl ? (
            <img className="suggestion-art" src={artUrl} alt="" draggable={false} />
          ) : (
            <Glyph name="thought" className="suggestion-glyph" />
          )}
          <div className="suggestion-text">
            <p>
              <strong>{t('Suggested turn:')}</strong> {suggestion.explanation}
            </p>
            <button
              className="primary-button"
              disabled={locked}
              onClick={() => {
                onRun({ kind: 'command', command: suggestion.command });
              }}
            >
              {t('Run suggested {tactic}', { tactic: t(suggestion.tactic.replace('-', ' ')) })}
            </button>
          </div>
        </div>
      )}
      <DifficultyLine encounter={encounter} />
      {!window && <CreatureActionsCard encounter={encounter} locked={locked} onRun={onRun} />}
      {!window && <LegendaryCard encounter={encounter} locked={locked} onRun={onRun} />}
      {!window && <DmReadiedList encounter={encounter} locked={locked} onRun={onRun} />}
      {!window && (
        <TurnOrderControls
          api={api}
          encounter={encounter}
          directory={directory}
          locked={locked}
          onRun={(command) => {
            onRun({ kind: 'command', command });
          }}
        />
      )}
      {!window && <LightControl encounter={encounter} locked={locked} onRun={onRun} />}
      <div className="action-row end-encounter">
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
            <Glyph name="cancel" />
            {t('End encounter')}
          </button>
        )}
      </div>
    </div>
  );
}
