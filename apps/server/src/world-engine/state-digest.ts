import { createHash } from 'node:crypto';

import type { WorldState } from '@ltw/domain';

/**
 * State digests for the restore drill (docs/adr/0037-deployment.md §4): SHA-256 over a canonical
 * encoding of the World Engine's canonical state. Two states digest equal exactly when they are
 * equal as values, whatever order their maps and sets were filled in.
 */
export function stateDigest(state: WorldState): string {
  return `sha256:${createHash('sha256').update(canonicalEncoding(state), 'utf8').digest('hex')}`;
}

/**
 * Deterministic, unambiguous encoding: strings and object keys JSON-quoted, object keys sorted,
 * `undefined` members omitted (as value equality ignores them), maps `M[[key,value],…]` and sets
 * `S[…]` sorted by their encoded keys and values, arrays in order. Anything else (functions,
 * symbols, big integers, class instances, non-finite numbers, holes or `undefined` in arrays) is
 * refused rather than guessed at.
 */
export function canonicalEncoding(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('state digest: non-finite number');
      return Object.is(value, -0) ? '-0' : JSON.stringify(value);
    case 'object':
      return encodeObject(value);
    default:
      throw new TypeError(`state digest: unsupported ${typeof value}`);
  }
}

function encodeObject(value: object): string {
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value) || value[index] === undefined) {
        throw new TypeError('state digest: undefined array element');
      }
      items.push(canonicalEncoding(value[index]));
    }
    return `[${items.join(',')}]`;
  }
  if (value instanceof Map) {
    const entries = [...(value as Map<unknown, unknown>)].map(
      ([key, member]) => [canonicalEncoding(key), canonicalEncoding(member)] as const,
    );
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `M[${entries.map(([key, member]) => `[${key},${member}]`).join(',')}]`;
  }
  if (value instanceof Set) {
    const members = [...(value as Set<unknown>)].map(canonicalEncoding).sort();
    return `S[${members.join(',')}]`;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('state digest: unsupported object');
  }
  const members = Object.keys(value)
    .sort()
    .flatMap((key) => {
      const member = (value as Record<string, unknown>)[key];
      return member === undefined ? [] : [`${JSON.stringify(key)}:${canonicalEncoding(member)}`];
    });
  return `{${members.join(',')}}`;
}
