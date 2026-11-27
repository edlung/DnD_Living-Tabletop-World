import { Glyph } from './glyph.tsx';
import { alignMiniature } from './miniature-base.ts';
import type { MedallionCondition } from './medallion.tsx';

/**
 * An approved tabletop figure, standing (docs/STAGE_330_DESIGN.md "Purposes", ADR 0035 §4): the
 * GPT-made miniature of a character, NPC or creature on its round base, exactly as the DM
 * approved it; code adds only the light under its base and a state's glyph. A down or dead one
 * is dimmed and marked like a medallion. Decorative: the control around it carries the name.
 * The caller decides whether a figure stands here (`useHeldImage`) and shows the medallion
 * otherwise; while the picture loads its place is held empty, never filled with a stand-in.
 */
export function Miniature({
  url,
  condition = null,
  mirrored = false,
}: {
  readonly url: string | null;
  readonly condition?: MedallionCondition | null;
  /** Drawn mirrored, turned to its left (every figure picture faces right). */
  readonly mirrored?: boolean;
}) {
  return (
    <span
      className={`miniature${condition ? ` is-${condition}` : ''}${mirrored ? ' is-mirrored' : ''}`}
      aria-hidden="true"
    >
      <span className="miniature-light" />
      {url && (
        <img
          className="miniature-art"
          src={url}
          alt=""
          draggable={false}
          onLoad={(event) => {
            alignMiniature(event.currentTarget);
          }}
        />
      )}
      {condition && <Glyph name={condition} className="miniature-condition" />}
    </span>
  );
}
