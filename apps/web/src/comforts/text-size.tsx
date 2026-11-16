import { useT } from '@ltw/ui';

import {
  changeDiceSettings,
  TEXT_SIZES,
  useDiceSettings,
  type TextSize,
} from '../dice/settings.ts';

const SIZE_WORDS: Readonly<Record<TextSize, string>> = {
  normal: 'Normal size',
  large: 'Larger',
  larger: 'Largest',
};

/**
 * The size of this screen's text (docs/adr/0072-keepsakes.md §3): three steps, kept in this
 * browser. It has two doors — the Dice sheet's settings, and the first page of "How to play",
 * where the person who needs it reads first.
 */
export function TextSizeChoice({ id }: { readonly id: string }) {
  const t = useT();
  const size = useDiceSettings().textSize;
  return (
    <div className="text-size-choice">
      <label htmlFor={id}>{t('Text size')}</label>
      <select
        id={id}
        value={size}
        onChange={(event) => {
          const chosen = TEXT_SIZES.find((one) => one === event.target.value);
          changeDiceSettings({ textSize: chosen ?? 'normal' });
        }}
      >
        {TEXT_SIZES.map((one) => (
          <option key={one} value={one}>
            {t(SIZE_WORDS[one])}
          </option>
        ))}
      </select>
    </div>
  );
}
