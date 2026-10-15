import type { CSSProperties } from 'react';

import { glyphUrl } from './ui-kit.ts';
import type { GlyphName } from './ui-kit-names.ts';

type GlyphStyle = CSSProperties & { readonly '--glyph': string };

/**
 * A GPT-made engraved glyph (ADR 0034 §5): a white alpha mask painted in `currentColor`, so it
 * takes the colour of its state. Always decorative — the word beside it, or the control's
 * accessible name, carries the meaning.
 */
export function Glyph({
  name,
  className,
}: {
  readonly name: GlyphName;
  readonly className?: string;
}) {
  const style: GlyphStyle = { '--glyph': `url("${glyphUrl(name)}")` };
  return (
    <span className={className ? `glyph ${className}` : 'glyph'} style={style} aria-hidden="true" />
  );
}
