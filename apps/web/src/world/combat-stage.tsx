import type { EncounterView, PlayerAssetView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import type { WorldApi } from '../api/client.ts';
import { useBoardView } from '../combat/board/board-view.ts';
import { CombatPanel } from '../combat/combat-panel.tsx';
import { useCombatantLabels } from '../combat/labels.ts';
import { ReactionPrompt } from '../combat/reaction-prompt.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * While the viewed world has an encounter (docs/STAGE_320_DESIGN.md §5.5): the stage shows the
 * battlefield, with the scene one click away. Whose turn it is — the one live announcement of
 * a turn (ADR 0033) — and a reaction the viewer is asked for stay over either view, so a
 * player looking at the scene still hears and answers them. The hidden battlefield stays
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
  imageOf,
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
  /** An approved portrait from the viewed place's presentation, when observed. */
  readonly imageOf: (entityId: string) => PlayerAssetView | null;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const view = useBoardView();
  const window = encounter.reactionWindow;
  const asked = actorId !== null && window !== null && window.choices.length > 0;
  const myTurn =
    actorId !== null &&
    encounter.currentCombatantId === actorId &&
    encounter.combatants.some((entry) => entry.entity.entityId === actorId);
  const labelOf = useCombatantLabels(encounter);
  const turn = asked
    ? t('Your reaction is needed')
    : myTurn
      ? t('Your turn')
      : t("{name}'s turn", { name: labelOf(encounter.currentCombatantId) });
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
        className={`turn-banner${asked || myTurn ? ' turn-banner--yours' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {turn}
      </p>
      {asked && (
        <ReactionPrompt
          key={window.windowId}
          api={api}
          encounter={encounter}
          actorId={actorId}
          canAct={canAct}
          locked={locked}
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
          onRun={onRun}
        />
      </div>
    </>
  );
}
