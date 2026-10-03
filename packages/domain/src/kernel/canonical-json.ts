/**
 * Deterministic JSON: object keys sorted recursively, `undefined` members
 * omitted (as JSON.stringify does). Used for command fingerprints, so two
 * submissions with the same content always compare equal.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('canonicalJson accepts only plain objects, arrays, and primitives');
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const member = (value as Record<string, unknown>)[key];
      if (member !== undefined) sorted[key] = sortKeys(member);
    }
    return sorted;
  }
  return value;
}
