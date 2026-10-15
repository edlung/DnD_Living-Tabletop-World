import type { ButtonHTMLAttributes } from 'react';

import { Glyph } from './glyph.tsx';
import type { GlyphName } from './ui-kit-names.ts';

/**
 * A glyph control (design §4, §7): the glyph is decorative and the label is the accessible
 * name. Icon-only, the same words show as a tooltip on hover and keyboard focus (drawn by the
 * stylesheet from `data-tip`, so the page's text holds the words once); `labelled` also shows
 * them beside the glyph where there is room (the stylesheet decides by width).
 */
export function IconButton({
  glyph,
  label,
  labelled = false,
  className,
  ...button
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'type'> & {
  readonly glyph: GlyphName;
  readonly label: string;
  readonly labelled?: boolean;
}) {
  const classes = ['icon-button', labelled ? 'icon-button--labelled' : '', className ?? ''];
  return (
    <button
      {...button}
      type="button"
      className={classes.filter(Boolean).join(' ')}
      aria-label={label}
      data-tip={label}
    >
      <Glyph name={glyph} />
      {labelled && (
        <span className="icon-button-label" aria-hidden="true">
          {label}
        </span>
      )}
    </button>
  );
}
