import type { Translate } from './i18n.tsx';

/**
 * Presentation of contract tokens only; no rule values are derived here. The readable
 * English form is the translation key, so a token such as `ambush-survived` reads
 * "Ambush Survived" and has a Russian entry of its own.
 */
export function readableLabel(value: string, t?: Translate): string {
  const label = value
    .split(/[-_]/u)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return t ? t(label) : label;
}

export function readableList(values: readonly string[], t?: Translate): string {
  return values.length === 0
    ? (t?.('None recorded') ?? 'None recorded')
    : values.map((value) => readableLabel(value, t)).join(', ');
}
