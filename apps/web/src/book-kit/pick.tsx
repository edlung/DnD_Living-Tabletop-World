import type { ReactNode } from 'react';

/**
 * A drawn choice or action (docs/adr/0075-book-interface.md §25): the vignette of an option of a
 * form, or of what a button does, in place of a bare radio button, a list or a word alone. The
 * pictures are the product's own set, drawn once in ink so they sit on any book's paper
 * (`scripts/book-materials/build.ts`: `pick-<name>`); the stylesheet hands the picture in by the
 * name (`visual/book-materials/generated/book-materials.css`). Decorative: the control around it says what
 * it is, in words.
 */
export function Pick({ name, className }: { readonly name: string; readonly className?: string }) {
  return (
    <span
      className={className ? `pick ${className}` : 'pick'}
      data-pick={name}
      aria-hidden="true"
    />
  );
}

/**
 * One option of a choice as a tile: the radio button is the whole tile, its picture above its
 * word (or, for an option that needs a line of words, beside it — `row`). The button itself stays
 * in the tile, unseen, so the keyboard, a screen reader and a journey choose as they always did.
 */
export function PickRadio({
  pick,
  name,
  value,
  checked,
  disabled = false,
  row = false,
  words = false,
  sample,
  onChange,
  children,
}: {
  readonly pick: string;
  readonly name: string;
  readonly value?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  /** The picture beside a line of words, not above one word. */
  readonly row?: boolean;
  /** A word alone, no picture: a choice of numbers, of hours, of sizes. */
  readonly words?: boolean;
  /** The word set at the size it chooses (the text's own size). */
  readonly sample?: string | undefined;
  readonly onChange: () => void;
  readonly children: ReactNode;
}) {
  return (
    <label
      className={row ? 'pick-row' : words ? 'pick-tile pick-tile--words' : 'pick-tile'}
      data-pick={pick}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="pick-words" style={sample === undefined ? undefined : { fontSize: sample }}>
        {children}
      </span>
    </label>
  );
}

export interface PickOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Its vignette; none in a choice of words (`PickTiles`' `words`). */
  readonly pick?: string;
  /** The word set at the size it chooses. */
  readonly sample?: string;
}

/**
 * A choice of a few named things as a row of tiles — what a short list of fixed options was (the
 * weather, who is surprised, who sees a roll). A group of radio buttons under its legend.
 */
export function PickTiles<T extends string>({
  legend,
  name,
  value,
  options,
  disabled = false,
  words = false,
  describedBy,
  onChange,
}: {
  readonly legend: string;
  readonly name: string;
  /** Null while nothing is chosen yet. */
  readonly value: T | null;
  readonly options: readonly PickOption<T>[];
  readonly disabled?: boolean;
  /** Tiles of words alone (numbers, hours, sizes): no vignette. */
  readonly words?: boolean;
  readonly describedBy?: string;
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset className="pick-tiles" aria-describedby={describedBy}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <PickRadio
          key={option.value}
          pick={option.pick ?? ''}
          name={name}
          value={option.value}
          checked={value === option.value}
          disabled={disabled}
          words={words}
          sample={option.sample}
          onChange={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </PickRadio>
      ))}
    </fieldset>
  );
}
