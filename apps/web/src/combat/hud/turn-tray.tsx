import type { ContextAction, EncounterCombatantView, EncounterView } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import type { ExplorationIntent } from '../../exploration/use-action.ts';
import { useReservedHeight } from '../../shell/reserved-height.ts';
import { actionGlyph } from '../../visual/glyph-map.ts';
import { Glyph } from '../../visual/glyph.tsx';
import { optionArtUrl, optionLabelFor, shortLabelFor } from '../combat-art.ts';
import { combatCommandFor } from '../combat-bindings.ts';
import { useCombatantLabels } from '../labels.ts';
import type { PlannedPath } from '../movement.ts';
import { optionNotes, warnsOfAlly } from '../target-options.tsx';

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
 * submits the existing command; the rules decide. Below 1200 px the side panel sits under the
 * board, out of view, so the tray also shows what matters at the moment of choosing: each
 * option's cost, range note or reason it is unavailable under its button, and the warning that
 * an area includes a party member above them (the panel's own alert announces it; these are its
 * visible echo).
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
  const labelOf = useCombatantLabels(encounter);
  const tray = useReservedHeight<HTMLElement>('--tray-h', true);
  const warned = choice.kind === 'combatant' && (choice.actions?.some(warnsOfAlly) ?? false);
  const hint =
    choice.kind === 'none'
      ? t('Choose a square to move, or a combatant to act.')
      : choice.kind === 'combatant' && choice.actions === null
        ? t('Checking what you can do…')
        : choice.kind === 'combatant' && choice.actions?.length === 0
          ? t('Nothing to do with this combatant.')
          : null;
  return (
    <section ref={tray} className="turn-tray" aria-label={t('Turn actions')}>
      {warned && (
        <p className="tray-warning" aria-hidden="true">
          <Glyph name="warning" />
          {t('Warning: this area includes a party member. You may still cast it.')}
        </p>
      )}
      <div className="tray-row">
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
            const url = optionArtUrl(action);
            const notes = optionNotes(t, action);
            return (
              <button
                key={`${action.id}:${action.weapon ?? ''}:${String(index)}`}
                type="button"
                className="tray-action"
                aria-label={optionLabelFor(t, action, labelOf(target.entity.entityId))}
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
                  {shortLabelFor(t, action)}
                </span>
                {notes.length > 0 && (
                  <small className="tray-note" aria-hidden="true">
                    {notes.join(' · ')}
                  </small>
                )}
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
      </div>
    </section>
  );
}
