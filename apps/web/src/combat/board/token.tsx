import type { CoverLevel, EncounterCombatantView, PlayerAssetView } from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';

import { useHeldImage } from '../../visual/approved-images.ts';
import { Glyph } from '../../visual/glyph.tsx';
import { Medallion } from '../../visual/medallion.tsx';
import { Miniature } from '../../visual/miniature.tsx';
import { boardUrl } from '../../visual/ui-kit.ts';
import { conditionGlyph } from '../combat-art.ts';
import { splitLabel } from '../labels.ts';

type HitPoints = { readonly current: number; readonly max: number };

/** The share of hit points left, as a bar's width (drawn markup, not a picture). */
export const hpShare = ({ current, max }: HitPoints): string =>
  `${String(Math.max(0, Math.min(100, (100 * current) / Math.max(1, max))))}%`;

/** Low (half or less) and critical (a quarter or less) bars change colour; words say the rest. */
export const hpLevel = ({ current, max }: HitPoints): '' | ' hp-bar--low' | ' hp-bar--critical' =>
  current * 4 <= max ? ' hp-bar--critical' : current * 2 <= max ? ' hp-bar--low' : '';

export function HpBar({ hitPoints }: { readonly hitPoints: HitPoints }) {
  return (
    <span className={`hp-bar${hpLevel(hitPoints)}`} aria-hidden="true">
      <span style={{ width: hpShare(hitPoints) }} />
    </span>
  );
}

/**
 * A combatant on the board (docs/STAGE_320_DESIGN.md §5.5; docs/STAGE_330_DESIGN.md "Purposes"):
 * its approved tabletop figure — standing upright on the tilted table, inside the GPT medallion
 * on the flat one — or else the medallion with its approved portrait or the neutral silhouette;
 * a ring of its side's light on the ground, the turn's glow, the teal ring of the selection, a
 * down or dead figure dimmed with its glyph, condition pips, hit points only when the
 * projection carries them, and its name plate. Decorative: the square it stands on carries all
 * of this in its name. Tilted, the figure stands upright on the plane while the ring lies on it.
 */
export function Token({
  combatant,
  label,
  cover,
  image,
  figure,
  tilted,
  current,
  selected,
  inArea,
}: {
  readonly combatant: EncounterCombatantView;
  /** Its name, or "Unidentified creature N" (`combat/labels.ts`). */
  readonly label: string;
  /** The cover level of its square, from the projection: a badge beside the figure. */
  readonly cover: CoverLevel | null;
  readonly image: PlayerAssetView | null;
  /** Its approved tabletop figure, when the viewed place's presentation carries one. */
  readonly figure: PlayerAssetView | null;
  /** The table is seen at an angle: a figure stands up on it. */
  readonly tilted: boolean;
  readonly current: boolean;
  readonly selected: boolean;
  readonly inArea: boolean;
}) {
  const t = useT();
  const standing = useHeldImage(figure);
  const upright = tilted && standing.held;
  // On a narrow plate the words may shorten; the number that tells two figures apart never does.
  const { words, number } = splitLabel(label);
  const condition =
    combatant.state === 'dead' ? 'dead' : combatant.state === 'down' ? 'unconscious' : null;
  const classes = [
    'token',
    `token--${combatant.side}`,
    `token--${combatant.state}`,
    upright ? 'has-miniature' : '',
    current ? 'is-current' : '',
    selected ? 'is-selected' : '',
    inArea ? 'in-area' : '',
  ];
  return (
    <span className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      <span className="token-ring" />
      <span className="token-figure">
        {combatant.conditions.length > 0 && (
          <span className="token-pips">
            {combatant.conditions.map((condition) => (
              <span key={condition} className="token-pip" title={t(readableLabel(condition))}>
                <Glyph name={conditionGlyph(condition)} />
              </span>
            ))}
          </span>
        )}
        {upright ? (
          <Miniature url={standing.url} condition={condition} />
        ) : (
          <Medallion
            image={image}
            figure={tilted ? null : figure}
            kind={combatant.entity.kind}
            tone={combatant.side}
            selected={selected}
            condition={condition}
          />
        )}
        {cover && (
          <span className={`token-cover token-cover--${cover}`}>
            <Glyph name="cover" />
            <span>{cover === 'total' ? t('total') : COVER_MARK[cover]}</span>
          </span>
        )}
        <span className="token-plate">
          <span className={`token-name${number ? ' has-number' : ''}`}>
            {number ? (
              <>
                <span className="name-words">{words}</span>{' '}
                <span className="name-number">{number}</span>
              </>
            ) : (
              label
            )}
          </span>
          {combatant.hitPoints && <HpBar hitPoints={combatant.hitPoints} />}
        </span>
      </span>
    </span>
  );
}

/** The cover badge's mark: the fraction of the rules' cover level (total in words). */
const COVER_MARK: Readonly<Record<Exclude<CoverLevel, 'total'>, string>> = {
  half: '½',
  'three-quarters': '¾',
};

const PIECES: Readonly<Record<CoverLevel, 'cover-half' | 'cover-three-quarters' | 'cover-total'>> =
  {
    half: 'cover-half',
    'three-quarters': 'cover-three-quarters',
    total: 'cover-total',
  };

/**
 * The GPT cover piece of a cover square: low crates, a boulder or a wall for half,
 * three-quarters and total cover. It marks the rules' cover level, never what the object is.
 * It stands at the square's back edge, scaled by level (a wall reads as a wall), so anyone in
 * the same square stands in front of it with the piece rising behind and above.
 */
export function CoverPiece({ level }: { readonly level: CoverLevel }) {
  return (
    <span className={`cover-piece cover-piece--${level}`} aria-hidden="true">
      <span className="cover-shadow" />
      <img className="cover-art" src={boardUrl(PIECES[level])} alt="" draggable={false} />
    </span>
  );
}
