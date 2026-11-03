import type {
  EncounterCombatantView,
  EncounterView,
  PlayerAssetView,
  Square,
  BoardTrap,
} from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import type { ReactNode, Ref } from 'react';

import { Glyph } from '../../visual/glyph.tsx';
import { IconButton } from '../../visual/icon-button.tsx';
import { Medallion } from '../../visual/medallion.tsx';
import { boardUrl } from '../../visual/ui-kit.ts';
import { HpBar } from '../board/token.tsx';
import { conditionGlyph } from '../combat-art.ts';
import { sideWords, stateWords, temporaryWords } from '../hit-point-words.ts';
import { useCombatantLabels } from '../labels.ts';
import type { MoveOption } from '../move-options.ts';
import { moveDetail } from '../move-words.ts';
import { trapWords } from '../board/square-name.ts';

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
  fall: 'The fall is waiting for a reaction.',
} as const;

/** The legend's terrain beyond the usual: only what this battlefield has. */
function terrainKeys(battlefield: EncounterView['battlefield']) {
  const water = battlefield.water ?? [];
  const ground = battlefield.ground ?? [];
  const light = battlefield.light ?? [];
  return [
    { swatch: 'wall', words: 'Wall', shown: (battlefield.walls?.length ?? 0) > 0 },
    { swatch: 'water', words: 'Water', shown: water.some((at) => at.deep !== true) },
    { swatch: 'deep', words: 'Deep water', shown: water.some((at) => at.deep === true) },
    { swatch: 'raised', words: 'Raised ground', shown: ground.some((at) => at.ft > 0) },
    { swatch: 'pit', words: 'Pit', shown: ground.some((at) => at.ft < 0) },
    // Its light and its fog (docs/adr/0050-the-world-around.md §1).
    {
      swatch: 'dim',
      words: 'Dim light',
      shown: battlefield.ambient === 'dim' || light.some((at) => at.level === 'dim'),
    },
    {
      swatch: 'dark',
      words: 'Darkness',
      shown: battlefield.ambient === 'dark' || light.some((at) => at.level === 'dark'),
    },
    { swatch: 'fog', words: 'Fog', shown: (battlefield.obscured?.length ?? 0) > 0 },
  ].filter((entry) => entry.shown);
}

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
        {/* Walls, water, raised ground and pits, when the battlefield has any (ADR 0049 §4–6). */}
        {terrainKeys(encounter.battlefield).map(({ swatch, words }) => (
          <li key={swatch}>
            <span className={`legend-swatch legend-swatch--${swatch}`} aria-hidden="true" />
            {t(words)}
          </li>
        ))}
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

/**
 * A chosen empty square: the advisory route the client composed and the other ways there — a
 * landing, a crawl, a jump, a drop (docs/adr/0049-space-and-movement.md §5–8); the rules decide.
 */
export function MoveDetails({
  square,
  moves,
  prone,
  riding = false,
  myTurn,
  trap,
  onDisarm,
  panel,
  onClose,
}: {
  readonly square: Square;
  readonly moves: readonly MoveOption[];
  /** A trap the party knows of on the square, and its disarming within reach (ADR 0057 §6). */
  readonly trap?: BoardTrap | undefined;
  readonly onDisarm?: (() => void) | undefined;
  /** The mover lies Prone: walking stands it up first. */
  readonly prone: boolean;
  /** The mover rides (docs/adr/0049-space-and-movement.md §10): its mount carries it. */
  readonly riding?: boolean;
  readonly myTurn: boolean;
  readonly panel: Ref<HTMLElement>;
  readonly onClose: () => void;
}) {
  const t = useT();
  const plan = moves.find((option) => option.kind === 'move') ?? null;
  const others = moves.flatMap((option) => moveDetail(t, option) ?? []);
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
      ) : riding ? (
        <p className="muted">
          {t('You ride: your mount carries you on its turn, or get down beside it.')}
        </p>
      ) : (
        <p className="muted">{t('No open route to this square.')}</p>
      )}
      {plan && prone && (
        <p className="muted">{t('Moving stands you up first, for half your Speed.')}</p>
      )}
      {others.length > 0 && (
        <ul className="side-moves">
          {others.map((words) => (
            <li key={words}>{words}</li>
          ))}
        </ul>
      )}
      {trap && (
        <p className="side-trap">
          <Glyph name="warning" />
          <span>{trapWords(t, trap)}</span>
        </p>
      )}
      {onDisarm && (
        <div className="action-row">
          <button type="button" className="primary-button" onClick={onDisarm}>
            <Glyph name="utilize" />
            {t('Disarm the trap')}
          </button>
        </div>
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
  children,
}: {
  readonly combatant: EncounterCombatantView;
  /** Its name, or "Unidentified creature N" (`combat/labels.ts`). */
  readonly label: string;
  readonly image: PlayerAssetView | null;
  readonly panel: Ref<HTMLElement>;
  readonly onClose: () => void;
  /** What it carries, for the DM (docs/adr/0057-encounters-maps-loot.md §7). */
  readonly children?: ReactNode;
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
      {children}
    </section>
  );
}
