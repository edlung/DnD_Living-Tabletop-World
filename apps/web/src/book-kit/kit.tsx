import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { momentIcon, partIcon, useBookTheme, type BookMoment, type BookPart } from './materials.ts';

/**
 * The book kit (docs/adr/0075-book-interface.md §1.1, Stage 1020): pieces every book is made of,
 * each in the open book's own materials (`materials.ts`). The spread, the foot's tray and the
 * fold-out join it with the book shell of Stage 1030.
 */

/** The icon of one of the book's parts, in the open book's own style; the product's glyph else. */
export function PartIcon({ part, glyph }: { readonly part: BookPart; readonly glyph: GlyphName }) {
  const src = partIcon(useBookTheme(), part);
  return src ? (
    <img className="bk-icon" src={src} alt="" width={28} height={28} decoding="async" />
  ) : (
    <Glyph name={glyph} />
  );
}

/** The icon of a kind of moment (talk, clue, letter, fight, puzzle), where the book has it. */
export function MomentIcon({
  moment,
  glyph,
}: {
  readonly moment: BookMoment;
  readonly glyph: GlyphName;
}) {
  const src = momentIcon(useBookTheme(), moment);
  return src ? (
    <img className="bk-icon" src={src} alt="" width={28} height={28} decoding="async" />
  ) : (
    <Glyph name={glyph} />
  );
}

/** The ribbon: where the party is in the story. Drawn in the book's own ribbon where it has one. */
export function Ribbon({ label }: { readonly label: string }) {
  return (
    <span className="bk-ribbon" role="img" aria-label={label}>
      <span className="bk-ribbon-cloth" aria-hidden="true" />
    </span>
  );
}
