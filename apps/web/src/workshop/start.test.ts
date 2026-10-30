import { describe, expect, it } from 'vitest';

import { workshopStart } from './start.ts';

describe('workshop invitation capture', () => {
  it('clears its fragment before returning a one-shot holder without making a request', () => {
    const token = 'a'.repeat(43);
    const calls: unknown[] = [];
    const start = workshopStart(
      { pathname: '/workshop/join', hash: `#${token}` },
      {
        replaceState: (...args: unknown[]) => {
          calls.push(args);
        },
      },
    );
    expect(calls).toEqual([[null, '', '/workshop']]);
    expect(start.kind).toBe('invited');
    if (start.kind !== 'invited') throw new Error('NO_INVITATION');
    expect(start.invitation.holds()).toBe(true);
    expect(start.invitation.take() === token).toBe(true);
    expect(start.invitation.take()).toBeNull();
    expect(Reflect.get(RegExp, 'input') as unknown).toBe('');
  });

  it('rejects a missing/malformed invitation after clearing the history entry', () => {
    let url = '';
    const start = workshopStart(
      { pathname: '/workshop/join', hash: '#malformed' },
      {
        replaceState: (_data: unknown, _unused: string, next?: string | URL | null) => {
          url = String(next);
        },
      },
    );
    expect(start).toEqual({ kind: 'failed' });
    expect(url).toBe('/workshop');
  });
});
