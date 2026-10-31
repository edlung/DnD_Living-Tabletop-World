import { IDENTITY_FIELDS, isRecord } from '../editing/model.ts';

export interface FieldChange {
  readonly path: readonly (string | number)[];
  readonly beforePath: readonly (string | number)[];
  readonly kind: 'ADD' | 'REMOVE' | 'CHANGE' | 'MOVE';
  readonly before: unknown;
  readonly after: unknown;
}
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function identity(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const field of ['key', 'questId', 'stage'])
    if (typeof value[field] === 'string') return `${field}:${value[field]}`;
  if (typeof value['entity'] === 'string' && typeof value['purpose'] === 'string')
    return `visual:${value['entity']}:${value['purpose']}`;
  if (typeof value['npc'] === 'string') return `relationship:${value['npc']}`;
  return null;
}
function keyed(items: readonly unknown[]): Map<string, { value: unknown; index: number }> | null {
  const map = new Map<string, { value: unknown; index: number }>();
  for (const [index, value] of items.entries()) {
    const key = identity(value);
    if (key === null || map.has(key)) return null;
    map.set(key, { value, index });
  }
  return map;
}

/** Complete field comparison; keyed objects are matched by identity, never by their name. */
export function compareFields(
  before: unknown,
  after: unknown,
  path: readonly (string | number)[] = [],
  beforePath: readonly (string | number)[] = path,
): FieldChange[] {
  if (equal(before, after)) return [];
  if (before === undefined) return [{ path, beforePath, kind: 'ADD', before, after }];
  if (after === undefined) return [{ path, beforePath, kind: 'REMOVE', before, after }];
  if (Array.isArray(before) && Array.isArray(after)) {
    const left: unknown[] = before,
      right: unknown[] = after;
    const old = keyed(left),
      next = keyed(right);
    if (old && next) {
      const changes: FieldChange[] = [];
      const sharedBefore = [...old.keys()].filter((key) => next.has(key)),
        sharedAfter = [...next.keys()].filter((key) => old.has(key));
      for (const [key, entry] of old)
        if (!next.has(key))
          changes.push({
            path: [...path, entry.index],
            beforePath: [...beforePath, entry.index],
            kind: 'REMOVE',
            before: entry.value,
            after: undefined,
          });
      for (const [key, entry] of next) {
        const prior = old.get(key);
        if (!prior)
          changes.push({
            path: [...path, entry.index],
            beforePath: [...beforePath, entry.index],
            kind: 'ADD',
            before: undefined,
            after: entry.value,
          });
        else {
          if (sharedBefore.indexOf(key) !== sharedAfter.indexOf(key))
            changes.push({
              path: [...path, entry.index],
              beforePath: [...beforePath, prior.index],
              kind: 'MOVE',
              before: prior.index + 1,
              after: entry.index + 1,
            });
          changes.push(
            ...compareFields(
              prior.value,
              entry.value,
              [...path, entry.index],
              [...beforePath, prior.index],
            ),
          );
        }
      }
      return changes;
    }
    // Unkeyed ordered lists are one value; no invented persistent row identities.
    return [{ path, beforePath, kind: 'CHANGE', before: left, after: right }];
  }
  if (isRecord(before) && isRecord(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !IDENTITY_FIELDS.has(key))
      .flatMap((key) =>
        compareFields(before[key], after[key], [...path, key], [...beforePath, key]),
      );
  return [{ path, beforePath, kind: 'CHANGE', before, after }];
}
