import type { EncounterView, PlayerAssetView, Square } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Board } from './board/board.tsx';
import type { BoardView } from './board/board-view.ts';
import { ActiveCard } from './hud/active-card.tsx';
import { InitiativeStrip } from './hud/initiative-strip.tsx';
import { BoardLegend, CombatantCard, MoveDetails } from './hud/side-panel.tsx';
import { CommandedTurn } from './commanded-turn.tsx';
import { TurnTray, type TrayChoice } from './hud/turn-tray.tsx';
import { occupantAt, squareMoves } from './move-options.ts';
import { useCombatantLabels } from './labels.ts';
import { combatOptions, TargetDetails, useTargetContext } from './target-options.tsx';

type Focus =
  | { readonly kind: 'square'; readonly square: Square }
  | { readonly kind: 'combatant'; readonly id: string };

const focusKey = (focus: Focus | null): string =>
  focus === null
    ? ''
    : focus.kind === 'square'
      ? `square:${String(focus.square.x)},${String(focus.square.y)}`
      : `combatant:${focus.id}`;

/**
 * The battlefield (docs/STAGE_320_DESIGN.md §5.5, ADR 0028): the board, the encounter's anchor
 * with the turn order, whose turn it is, the chosen square's or combatant's details in the side
 * panel, and the turn tray only while the viewer may act. Choosing opens the details and moves
 * focus there; acting or Escape dismisses them. No permanent action bar exists. `actorId` is
 * null for the DM.
 */
export function CombatPanel({
  api,
  encounter,
  actorId,
  canAct,
  locked,
  asked,
  view,
  imageOf,
  figureOf,
  battleMap,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly actorId: string | null;
  readonly canAct: boolean;
  readonly locked: boolean;
  /** The viewer is asked for a reaction: the prompt takes the side panel's place. */
  readonly asked: boolean;
  readonly view: BoardView;
  readonly imageOf: (entityId: string) => PlayerAssetView | null;
  readonly figureOf: (entityId: string) => PlayerAssetView | null;
  readonly battleMap: PlayerAssetView | null;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const [focus, setFocus] = useState<Focus | null>(null);
  const section = useRef<HTMLElement>(null);
  const panel = useRef<HTMLElement>(null);
  const ids = useId();
  const labelOf = useCombatantLabels(encounter);
  const self = encounter.combatants.find((entry) => entry.entity.entityId === actorId);
  const myTurn = self !== undefined && encounter.currentCombatantId === actorId;
  const mayAct = actorId !== null && canAct && myTurn && encounter.reactionWindow === null;
  // A creature the viewer's character commands, on its own turn (docs/adr/0044-online-play.md §7):
  // the viewer moves it, a mount among them, where its rider directs (ADR 0049 §10).
  const commanding =
    actorId !== null &&
    canAct &&
    encounter.reactionWindow === null &&
    encounter.combatants.find((entry) => entry.entity.entityId === encounter.currentCombatantId)
      ?.commandedBy?.entityId === actorId;
  const moverId = commanding ? encounter.currentCombatantId : actorId;
  const picked =
    focus?.kind === 'combatant'
      ? (encounter.combatants.find((entry) => entry.entity.entityId === focus.id) ?? null)
      : null;
  // The ways to a chosen square (docs/adr/0049-space-and-movement.md §5–8); the first is drawn.
  const moves =
    focus?.kind === 'square' && moverId !== null
      ? squareMoves(encounter, moverId, focus.square)
      : [];
  const { resource, retry } = useTargetContext(
    api,
    picked && actorId !== null ? picked.entity.entityId : null,
  );
  const options = picked && actorId !== null ? combatOptions(resource) : null;
  // The previewed area is exactly the combatants the server says Fireball would affect.
  const areaKey =
    options
      ?.find((action) => action.id === 'fireball')
      ?.area?.affected.map((ref) => ref.entityId)
      .join('|') ?? '';
  const affected = useMemo(() => new Set(areaKey === '' ? [] : areaKey.split('|')), [areaKey]);
  const detailId = (index: number) => `${ids}-option-${String(index)}`;
  const chosen = focusKey(focus);
  useEffect(() => {
    if (chosen !== '') panel.current?.focus({ preventScroll: true });
  }, [chosen]);
  const pick = (square: Square) => {
    const occupant = occupantAt(encounter, square);
    setFocus(
      occupant ? { kind: 'combatant', id: occupant.entity.entityId } : { kind: 'square', square },
    );
  };
  const close = () => {
    const square = section.current?.querySelector<HTMLElement>(
      '.board-square[aria-pressed="true"]',
    );
    setFocus(null);
    square?.focus({ preventScroll: true });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || focus === null || event.defaultPrevented) return;
    event.preventDefault();
    close();
  };
  const choice: TrayChoice =
    focus?.kind === 'square'
      ? { kind: 'square', moves }
      : picked
        ? { kind: 'combatant', target: picked, actions: options }
        : { kind: 'none' };
  const side =
    focus?.kind === 'square' && actorId !== null ? (
      <MoveDetails
        square={focus.square}
        moves={moves}
        prone={self?.conditions.includes('prone') ?? false}
        riding={self?.mountedOn !== undefined && !commanding}
        myTurn={myTurn || commanding}
        panel={panel}
        onClose={close}
      />
    ) : picked && actorId !== null ? (
      <TargetDetails
        key={picked.entity.entityId}
        target={picked}
        labelOf={labelOf}
        image={imageOf(picked.entity.entityId)}
        resource={resource}
        retry={retry}
        mayAct={mayAct}
        detailId={detailId}
        panel={panel}
        onClose={close}
      />
    ) : picked ? (
      <CombatantCard
        combatant={picked}
        label={labelOf(picked.entity.entityId)}
        image={imageOf(picked.entity.entityId)}
        panel={panel}
        onClose={close}
      />
    ) : (
      <BoardLegend encounter={encounter} isDm={actorId === null} />
    );
  return (
    <section
      ref={section}
      className={`combat-panel${asked ? ' is-asked' : ''}`}
      aria-label={t('Battlefield')}
      onKeyDown={onKeyDown}
    >
      <InitiativeStrip encounter={encounter} actorId={actorId} imageOf={imageOf} />
      <ActiveCard api={api} encounter={encounter} actorId={actorId} imageOf={imageOf} />
      <Board
        encounter={encounter}
        labelOf={labelOf}
        currentCombatantId={encounter.currentCombatantId}
        selfId={actorId}
        selected={focus?.kind === 'square' ? focus.square : (picked?.position ?? null)}
        path={moves[0]?.path ?? []}
        moverId={moverId}
        affected={affected}
        imageOf={imageOf}
        figureOf={figureOf}
        battleMap={battleMap}
        view={view}
        onPick={pick}
      />
      <div className="combat-side">{side}</div>
      {mayAct && (
        <TurnTray
          encounter={encounter}
          actorId={actorId}
          choice={choice}
          locked={locked}
          detailId={detailId}
          onRun={onRun}
        />
      )}
      {/* A creature the player's character commands (ADR 0044 §7): its turn, where theirs is. */}
      {!mayAct && encounter.reactionWindow === null && (
        <CommandedTurn
          api={api}
          encounter={encounter}
          actorId={canAct ? actorId : null}
          moves={commanding ? moves : []}
          target={commanding ? picked : null}
          locked={locked}
          onRun={onRun}
        />
      )}
    </section>
  );
}
