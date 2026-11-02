import type {
  EncounterCombatantView,
  EncounterView,
  PlayerAssetView,
  Square,
} from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import type { Ref } from 'react';

import { Glyph } from '../../visual/glyph.tsx';
import { IconButton } from '../../visual/icon-button.tsx';
import { Medallion } from '../../visual/medallion.tsx';
import { boardUrl } from '../../visual/ui-kit.ts';
import { HpBar } from '../board/token.tsx';
import { conditionGlyph } from '../combat-art.ts';
import { sideWords, stateWords, temporaryWords } from '../hit-point-words.ts';
import { useCombatantLabels } from '../labels.ts';
import type { PlannedPath } from '../movement.ts';

/**
 * The side panel at rest (docs/STAGE_320_DESIGN.md §5.5): how to read the board — what the
 * pieces and rings mean — and for the DM, while a spell waits for reactions, each candidate's
 * answer.
 */
/** What an open window holds, by what set it off (docs/adr/0046-reactions-beyond-counterspell.md). */
const WINDOW_WAITS = {
  spell: 'Spell resolution is waiting for reactions.',
  move: 'The move is waiting for opportunity attacks.',
  attack: 'The attack is waiting for a reaction.',
  damage: 'The damage done is waiting for a reaction.',
} as const;

export function BoardLegend({
  encounter,
  isDm,
}: {
  readonly encounter: EncounterView;
  readonly isDm: boolean;
}) {
  const t = useT();
  const window = encounter.reactionWindow;
  const nameOf = useCombatantLabels(encounter);
  return (
    <section className="combat-side-card board-legend" aria-label={t('Reading the board')}>
      <p className="eyebrow">{t('Reading the board')}</p>
      <p className="legend-hint">
        {isDm
          ? t('The DM acts for creatures with the Encounter tools (suggested turn).')
          : t('Choose a square to move, or a combatant to act.')}
      </p>
      <ul className="legend">
        <li>
          <span className="legend-swatch" aria-hidden="true" />
          {t('Difficult terrain')}
        </li>
        <li>
          <img src={boardUrl('cover-half')} alt="" />
          {t('Half cover')}
        </li>
        <li>
          <img src={boardUrl('cover-three-quarters')} alt="" />
          {t('Three-quarters cover')}
        </li>
        <li>
          <img src={boardUrl('cover-total')} alt="" />
          {t('Total cover')}
        </li>
        <li>
          <span className="legend-ring legend-ring--party" aria-hidden="true" />
          {t('Party')}
        </li>
        <li>
          <span className="legend-ring legend-ring--hostile" aria-hidden="true" />
          {t('Hostile')}
        </li>
      </ul>
      {window && isDm && (
        <div className="legend-window">
          <p>
            <Glyph name="reaction" />
            {t(WINDOW_WAITS[window.trigger.kind])}
          </p>
          {window.candidates.length > 0 && (
            <ul>
              {window.candidates.map((candidate) => (
                <li key={candidate.entityId}>
                  {nameOf(candidate.entityId)}: {t(readableLabel(candidate.response))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** A chosen empty square: the advisory route the client composed; the rules decide. */
export function MoveDetails({
  square,
  plan,
  myTurn,
  panel,
  onClose,
}: {
  readonly square: Square;
  readonly plan: PlannedPath | null;
  readonly myTurn: boolean;
  readonly panel: Ref<HTMLElement>;
  readonly onClose: () => void;
}) {
  const t = useT();
  return (
    <section
      ref={panel}
      className="combat-side-card move-card"
      aria-label={t('Move options')}
      tabIndex={-1}
    >
      <header className="side-header">
        <Glyph name="move" className="side-glyph" />
        <div className="side-title">
          <p className="eyebrow">{t('Move options')}</p>
          <h3>{t('Square {x}, {y}', { x: square.x, y: square.y })}</h3>
        </div>
        <IconButton glyph="close" label={t('Close options')} onClick={onClose} />
      </header>
      {!myTurn && <p className="muted">{t('You can move on your own turn.')}</p>}
      {plan ? (
        <p className="side-route">
          {t(
            plan.path.length === 1
              ? 'Route: {count} square, about {feet} ft. The rules confirm your speed.'
              : 'Route: {count} squares, about {feet} ft. The rules confirm your speed.',
            { count: plan.path.length, feet: plan.costFt },
          )}
        </p>
      ) : (
        <p className="muted">{t('No open route to this square.')}</p>
      )}
    </section>
  );
}

/** The DM's look at one combatant: everything the DM projection carries for it. */
export function CombatantCard({
  combatant,
  label,
  image,
  panel,
  onClose,
}: {
  readonly combatant: EncounterCombatantView;
  /** Its name, or "Unidentified creature N" (`combat/labels.ts`). */
  readonly label: string;
  readonly image: PlayerAssetView | null;
  readonly panel: Ref<HTMLElement>;
  readonly onClose: () => void;
}) {
  const t = useT();
  return (
    <section
      ref={panel}
      className="combat-side-card combatant-card"
      aria-label={t('Combatant')}
      tabIndex={-1}
    >
      <header className="side-header">
        <Medallion image={image} kind={combatant.entity.kind} size="lg" tone={combatant.side} />
        <div className="side-title">
          <p className="eyebrow">{sideWords(t, combatant)}</p>
          <h3>{label}</h3>
          <p className="side-state">{stateWords(t, combatant)}</p>
        </div>
        <IconButton glyph="close" label={t('Close options')} onClick={onClose} />
      </header>
      {combatant.hitPoints && (
        <p className="side-hp">
          <Glyph name="hit-points" />
          {t('Hit points: {current} / {max}', { ...combatant.hitPoints })}
          {temporaryWords(t, combatant.hitPoints) && (
            <span className="hp-temporary">{temporaryWords(t, combatant.hitPoints)}</span>
          )}
          <HpBar hitPoints={combatant.hitPoints} />
        </p>
      )}
      {combatant.initiative && (
        <p className="side-initiative">
          <Glyph name="initiative" />
          {t('Initiative {total} (roll {roll}, modifier {modifier})', {
            total: combatant.initiative.total,
            roll: combatant.initiative.roll,
            modifier: combatant.initiative.modifier,
          })}
          {combatant.initiative.surprised && (
            <small className="muted">{t('Surprised: rolled with Disadvantage.')}</small>
          )}
        </p>
      )}
      {combatant.conditions.length > 0 && (
        <ul className="side-conditions" aria-label={t('Conditions')}>
          {combatant.conditions.map((condition) => (
            <li key={condition}>
              <Glyph name={conditionGlyph(condition)} />
              {t(readableLabel(condition))}
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        {t('The DM acts for creatures with the Encounter tools (suggested turn).')}
      </p>
    </section>
  );
}
