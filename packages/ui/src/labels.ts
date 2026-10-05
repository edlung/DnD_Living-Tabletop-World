/** Presentation of contract tokens only; no rule values are derived here. */
export function readableLabel(value: string): string {
  return value
    .split(/[-_]/u)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function readableList(values: readonly string[]): string {
  return values.length === 0 ? 'None recorded' : values.map(readableLabel).join(', ');
}
