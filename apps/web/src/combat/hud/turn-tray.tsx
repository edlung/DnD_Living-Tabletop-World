import type { ContextAction, EncounterCombatantView, EncounterView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import type { ExplorationIntent } from '../../exploration/use-action.ts';
import { actionGlyph } from '../../visual/glyph-map.ts';
import { Glyph } from '../../visual/glyph.tsx';
import { catalogUrl } from '../../visual/ui-kit.ts';
import { combatantLabel } from '../board/square-name.ts';
import { catalogArtOf, optionLabel, shortLabelOf } from '../combat-art.ts';
import { combatCommandFor } from '../combat-bindings.ts';
import type { PlannedPath } from '../movement.ts';

/** What the tray offers: the chosen square's move, or the chosen combatant's listed options. */
export type TrayChoice =
  | { readonly kind: 'none' }
  | { readonly kind: 'square'; readonly plan: PlannedPath | null }
  | {
      readonly kind: 'combatant';
      readonly target: EncounterCombatantView;
      /** The server's options for it; null while they load. */
      readonly actions: readonly ContextAction[] | null;
    };

/**
 * The turn tray (docs/STAGE_320_DESIGN.md §5.5): shown only while the viewer may act — never a
 * permanent action bar. It holds the server-listed options for what is chosen, each as its
 * catalog picture or glyph with short words (its full words are its name, and its details in
 * the side panel describe it), the advisory move to a chosen square, and End turn. Each button
 * submits the existing command; the rules decide.
 */
export function TurnTray({
  encounter,
  actorId,
  choice,
  locked,
  detailId,
  onRun,
}: {
  readonly encounter: EncounterView;
  readonly actorId: string;
  readonly choice: TrayChoice;
  readonly locked: boolean;
  /** The side panel's description of an option, by its place in the list. */
  readonly detailId: (index: number) => string;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const hint =
    choice.kind === 'none'
      ? t('Choose a square to move, or a combatant to act.')
      : choice.kind === 'combatant' && choice.actions === null
        ? t('Checking what you can do…')
        : choice.kind === 'combatant' && choice.actions?.length === 0
          ? t('Nothing to do with this combatant.')
          : null;
  return (
    <section className="turn-tray" aria-label={t('Turn actions')}>
      {hint && <p className="tray-hint">{hint}</p>}
      {choice.kind === 'square' && (
        <button
          type="button"
          className="tray-action"
          disabled={locked || choice.plan === null}
          onClick={() => {
            if (choice.plan) {
              onRun({
                kind: 'command',
                command: {
                  type: 'MoveCombatant',
                  combatantId: actorId,
                  path: [...choice.plan.path],
                },
              });
            }
          }}
        >
          <Glyph name="move" className="tray-glyph" />
          <span className="tray-words">{t('Move here')}</span>
        </button>
      )}
      {choice.kind === 'combatant' &&
        choice.actions?.map((action, index) => {
          const { target } = choice;
          const command = combatCommandFor(
            action,
            actorId,
            { entityId: target.entity.entityId, position: target.position },
            encounter,
          );
          const art = catalogArtOf(action.id);
          const url = art ? catalogUrl(art.kind, art.id) : null;
          return (
            <button
              key={`${action.id}:${String(index)}`}
              type="button"
              className="tray-action"
              aria-label={optionLabel(t, action.id, combatantLabel(target))}
              aria-describedby={detailId(index)}
              disabled={locked || command === null}
              onClick={() => {
                if (command) onRun({ kind: 'command', command });
              }}
            >
              {url ? (
                <img className="tray-art" src={url} alt="" draggable={false} />
              ) : (
                <Glyph name={actionGlyph(action.id)} className="tray-glyph" />
              )}
              <span className="tray-words" aria-hidden="true">
                {t(shortLabelOf(action.id))}
              </span>
            </button>
          );
        })}
      <button
        type="button"
        className="tray-end"
        disabled={locked}
        onClick={() => {
          onRun({ kind: 'command', command: { type: 'EndTurn', combatantId: actorId } });
        }}
      >
        <Glyph name="end-turn" className="tray-glyph" />
        <span className="tray-words">{t('End turn')}</span>
      </button>
    </section>
  );
}
