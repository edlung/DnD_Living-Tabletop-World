import { describe, expect, it } from 'vitest';

import { createLocalProvider } from './local-provider.ts';
import type { RoutedProvider } from './providers.ts';
import { CapabilityRouter } from './router.ts';
import { scripted } from './testing/providers.ts';

/**
 * The router reads each route once into a frozen snapshot, checks that snapshot's shape and keeps
 * exactly it (docs/adr/0032-live-ai.md, B1 repair 1): a route that changes between reads, or a
 * caller that mutates an array later, cannot alter what was checked.
 */
const local = createLocalProvider();
const remote = scripted('remote');

/** An iterable route that yields `first` on its first pass and `later` on every other pass. */
function shifting(first: RoutedProvider[], later: RoutedProvider[]) {
  let passes = 0;
  const route = {
    *[Symbol.iterator]() {
      passes += 1;
      yield* passes === 1 ? first : later;
    },
  };
  return { route: route as unknown as readonly RoutedProvider[], passes: () => passes };
}

describe('CapabilityRouter', () => {
  it('reads an iterable route once and keeps what it checked', () => {
    const { route, passes } = shifting([local], [remote, remote, remote]);
    const router = new CapabilityRouter({ reasoning: route });

    expect(passes()).toBe(1);
    expect(router.providersFor('reasoning')).toEqual([local]);
  });

  it('reads a getter route once', () => {
    let reads = 0;
    const routes = {
      get reasoning() {
        reads += 1;
        return reads === 1 ? [remote, local] : [remote, remote, remote];
      },
    };
    const router = new CapabilityRouter(routes);

    expect(reads).toBe(1);
    expect(router.providersFor('reasoning')).toEqual([remote, local]);
  });

  it('rejects a bad shape it read, whatever a later read would say', () => {
    const { route } = shifting([remote, remote], [local]);
    expect(() => new CapabilityRouter({ reasoning: route })).toThrow(/two-provider route/);
  });

  it('never exposes a mutable route, and ignores later changes to the input', () => {
    const input = [remote, local];
    const router = new CapabilityRouter({ reasoning: input, narrative: [local] });
    input[0] = local;
    const route = router.providersFor('reasoning');

    expect(route).toEqual([remote, local]);
    expect(Object.isFrozen(route)).toBe(true);
    expect(() => {
      (route as RoutedProvider[])[0] = local;
    }).toThrow(TypeError);
    expect(() => {
      (route as RoutedProvider[]).push(local);
    }).toThrow(TypeError);
    expect(Object.isFrozen(router.providersFor('vision'))).toBe(true);
    expect(router.providersFor('reasoning')).toEqual([remote, local]);
  });
});
