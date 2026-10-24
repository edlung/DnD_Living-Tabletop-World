import { Glyph } from './glyph.tsx';
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
}: {
  readonly url: string | null;
  readonly condition?: MedallionCondition | null;
}) {
  return (
    <span className={`miniature${condition ? ` is-${condition}` : ''}`} aria-hidden="true">
      <span className="miniature-light" />
      {url && <img className="miniature-art" src={url} alt="" draggable={false} />}
      {condition && <Glyph name={condition} className="miniature-condition" />}
    </span>
  );
}
