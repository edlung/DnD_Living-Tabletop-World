import { useT } from '@ltw/ui';

import {
  changeDiceSettings,
  TEXT_SIZES,
  useDiceSettings,
  type TextSize,
} from '../dice/settings.ts';
import { PickTiles } from '../book-kit/pick.tsx';

/** Each size's word is set at the size it chooses, relative to the text around it. */
const SIZE_SAMPLES: Readonly<Record<TextSize, string>> = {
  normal: '1em',
  large: '1.15em',
  larger: '1.3em',
};

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
      <PickTiles
        legend={t('Text size')}
        name={id}
        value={size}
        words
        options={TEXT_SIZES.map((one) => ({
          value: one,
          label: t(SIZE_WORDS[one]),
          sample: SIZE_SAMPLES[one],
        }))}
        onChange={(textSize) => {
          changeDiceSettings({ textSize });
        }}
      />
    </div>
  );
}
