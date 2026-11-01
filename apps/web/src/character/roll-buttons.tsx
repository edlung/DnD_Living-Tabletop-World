import type { Check } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { useDiceTable } from '../dice/table.tsx';
import { Glyph } from '../visual/glyph.tsx';

/**
 * Whether the viewer rolls for this character from its sheet (Stage 510): the character's own
 * player, or the DM. Null when it may not (another character's sheet, no dice at the table).
 */
export function useRollFor(characterId: string): ((check: Check) => void) | null {
  const table = useDiceTable();
  if (!table || (!table.isDm && table.characterId !== characterId)) return null;
  return (check) => {
    void table.roll({ kind: 'check', characterId, check, mode: 'normal' });
  };
}

/** A roll button with the die glyph; its name says what is rolled. */
export function RollButton({
  label,
  onRoll,
  text,
}: {
  readonly label: string;
  readonly onRoll: () => void;
  /** Visible words beside the glyph, if any. */
  readonly text?: string;
}) {
  const t = useT();
  const busy = useDiceTable()?.busy ?? false;
  return (
    <button
      type="button"
      className={text ? 'roll-button roll-button--text' : 'roll-button'}
      aria-label={label}
      title={text ? undefined : label}
      disabled={busy}
      onClick={onRoll}
    >
      <Glyph name="roll" />
      {text && <span aria-hidden="true">{t(text)}</span>}
    </button>
  );
}
