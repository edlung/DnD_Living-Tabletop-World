import type { EntityKind, PlayerAssetView } from '@ltw/contracts';

import { useApprovedImage } from './approved-images.ts';
import { Glyph } from './glyph.tsx';
import { isFigure, kindGlyph } from './glyph-map.ts';
import { boardUrl, ornamentUrl, textureUrl } from './ui-kit.ts';

export type MedallionSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
/** The ring's light: gold by default, or the side in a fight (design §3). */
export type MedallionTone = 'gold' | 'party' | 'hostile' | 'neutral';
export type MedallionCondition = 'wounded' | 'unconscious' | 'dead';

/**
 * A round portrait in the GPT gold ring (design §1.4, §5.2). The face is the approved image
 * when the projection carries one; otherwise a person or creature shows the neutral
 * silhouette and anything else the neutral mist with its kind's glyph, never a stand-in that
 * claims what the subject looks like. Given an approved figure (the flat battlefield, ADR 0035
 * §4), the figure stands inside the ring instead, seen to the knees, and the portrait remains
 * its fallback.
 * Selection lights the ring teal. Decorative: the control around it carries the name.
 */
export function Medallion({
  image,
  kind,
  size = 'md',
  tone = 'gold',
  selected = false,
  condition = null,
  figure = null,
}: {
  readonly image: PlayerAssetView | null;
  readonly kind: EntityKind;
  readonly size?: MedallionSize;
  readonly tone?: MedallionTone;
  readonly selected?: boolean;
  /** Down or dead figures are dimmed and marked with their state's glyph. */
  readonly condition?: MedallionCondition | null;
  /** The approved tabletop figure, shown inside the ring when it is available. */
  readonly figure?: PlayerAssetView | null;
}) {
  const url = useApprovedImage(image);
  const standing = useApprovedImage(figure);
  const classes = [
    'medallion',
    `medallion--${size}`,
    `medallion--${tone}`,
    selected ? 'is-selected' : '',
    condition ? `is-${condition}` : '',
  ];
  return (
    <span className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      <span className="medallion-face">
        {standing ? (
          <img className="medallion-figure" src={standing} alt="" draggable={false} />
        ) : url ? (
          <img src={url} alt="" />
        ) : isFigure(kind) ? (
          <img className="medallion-silhouette" src={boardUrl('figure-silhouette')} alt="" />
        ) : (
          <>
            <img className="medallion-mist" src={textureUrl('scene-fallback')} alt="" />
            <Glyph name={kindGlyph(kind)} className="medallion-kind" />
          </>
        )}
      </span>
      <img className="medallion-ring" src={ornamentUrl('portrait-ring')} alt="" />
      {condition && <Glyph name={condition} className="medallion-condition" />}
    </span>
  );
}
