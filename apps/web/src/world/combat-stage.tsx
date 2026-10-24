import type { EncounterView, PlayerAssetView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useRef } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useBoardView } from '../combat/board/board-view.ts';
import { CombatPanel } from '../combat/combat-panel.tsx';
import { useCombatantLabels } from '../combat/labels.ts';
import { askedWindowOf, ReactionPrompt } from '../combat/reaction-prompt.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * While the viewed world has an encounter (docs/STAGE_320_DESIGN.md §5.5): the stage shows the
 * battlefield, with the scene one click away. Whose turn it is — the one live announcement of
 * a turn (ADR 0033) — and a reaction the viewer is asked for stay over either view, so a
 * player looking at the scene still hears and answers them. Each is announced once: the
 * banner's live words say only whose turn it is (it shows "Your reaction is needed" while the
 * prompt, which announces itself by taking focus, waits), and when the question goes away with
 * focus on it, focus comes back to the banner, never to the page. The hidden battlefield stays
 * mounted, so a chosen square or open options survive switching and every refresh; how the
 * board is seen (flat or tilted, zoom) lives here and survives each own action.
 */
export function CombatStage({
  api,
  encounter,
  revision,
  battlefield,
  onView,
  actorId,
  canAct,
  locked,
  blocked,
  imageOf,
  figureOf,
  battleMap,
  onRun,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  /** The screen's action count: the battlefield starts afresh after each own action. */
  readonly revision: number;
  readonly battlefield: boolean;
  readonly onView: (view: 'scene' | 'battlefield') => void;
  readonly actorId: string | null;
  readonly canAct: boolean;
  readonly locked: boolean;
  /** The Chronicle is open over the stage: the reaction prompt waits for it to close. */
  readonly blocked: boolean;
  /** An approved portrait from the viewed place's presentation, when observed. */
  readonly imageOf: (entityId: string) => PlayerAssetView | null;
  /** An approved tabletop figure from the same presentation (ADR 0035 §4). */
  readonly figureOf: (entityId: string) => PlayerAssetView | null;
  /** The encounter place's approved battle map, when the viewed place is where it is fought. */
  readonly battleMap: PlayerAssetView | null;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const view = useBoardView();
  const window = encounter.reactionWindow;
  const asked = askedWindowOf(encounter, actorId) !== null;
  const myTurn =
    actorId !== null &&
    encounter.currentCombatantId === actorId &&
    encounter.combatants.some((entry) => entry.entity.entityId === actorId);
  const labelOf = useCombatantLabels(encounter);
  const turn = myTurn
    ? t('Your turn')
    : t("{name}'s turn", { name: labelOf(encounter.currentCombatantId) });
  const banner = useRef<HTMLParagraphElement>(null);
  const asking = useRef(asked);
  useEffect(() => {
    const was = asking.current;
    asking.current = asked;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (was && !asked && lost) banner.current?.focus({ preventScroll: true });
  }, [asked]);
  return (
    <>
      <div className="stage-switch" role="tablist" aria-label={t('What the stage shows')}>
        <button
          type="button"
          role="tab"
          aria-selected={!battlefield}
          aria-controls="scene-presence"
          onClick={() => {
            onView('scene');
          }}
        >
          <Glyph name="look" />
          {t('Scene')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={battlefield}
          aria-controls="combat-stage"
          onClick={() => {
            onView('battlefield');
          }}
        >
          <Glyph name="encounter" />
          {t('Battlefield')}
        </button>
      </div>
      <p
        ref={banner}
        className={`turn-banner${asked || myTurn ? ' turn-banner--yours' : ''}`}
        tabIndex={-1}
      >
        <span
          className={asked ? 'visually-hidden' : undefined}
          aria-live="polite"
          aria-atomic="true"
        >
          {turn}
        </span>
        {asked && <span>{t('Your reaction is needed')}</span>}
      </p>
      {asked && window && actorId !== null && (
        <ReactionPrompt
          key={window.windowId}
          api={api}
          encounter={encounter}
          actorId={actorId}
          canAct={canAct}
          locked={locked}
          blocked={blocked}
          onRun={onRun}
        />
      )}
      <div className="combat-stage" id="combat-stage" hidden={!battlefield}>
        <CombatPanel
          key={`combat:${String(revision)}`}
          api={api}
          encounter={encounter}
          actorId={actorId}
          canAct={canAct}
          locked={locked}
          asked={asked}
          view={view}
          imageOf={imageOf}
          figureOf={figureOf}
          battleMap={battleMap}
          onRun={onRun}
        />
      </div>
    </>
  );
}
