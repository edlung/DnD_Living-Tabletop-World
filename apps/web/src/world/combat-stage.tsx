import type { EncounterView } from '@ltw/contracts';
import { EncounterSummary, useT } from '@ltw/ui';

import type { WorldApi } from '../api/client.ts';
import { CombatPanel } from '../combat/combat-panel.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * While the viewed world has an encounter (docs/STAGE_320_DESIGN.md §5.5; part B redraws the
 * battlefield): the stage shows the battlefield, with the scene one click away, and the
 * encounter's summary stays visible either way. The hidden view stays mounted, so a chosen
 * square or open options survive switching and every refresh.
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
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
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
      <div className="combat-stage" id="combat-stage" hidden={!battlefield}>
        <CombatPanel
          key={`combat:${String(revision)}`}
          api={api}
          encounter={encounter}
          actorId={actorId}
          canAct={canAct}
          locked={locked}
          onRun={onRun}
        />
      </div>
      <div className="encounter-card">
        <EncounterSummary encounter={encounter} />
      </div>
    </>
  );
}
