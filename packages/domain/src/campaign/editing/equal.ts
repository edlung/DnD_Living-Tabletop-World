function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, normalized(item)]),
  );
}

/** Object key order is immaterial; every array order and primitive value is protected. */
export function campaignEditValueEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}
