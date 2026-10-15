import { createLocalProvider, isLocalProvider, outputResponse, type RoutedProvider } from '@ltw/ai';
import type { AiCapability, DmIntentResponse } from '@ltw/contracts';
import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../platform/config/config.ts';
import {
  TOKENS,
  post,
  ravenfordApp,
  seededEngine,
  testProvider,
} from '../testing/ravenford-app.ts';
import { composedGateway } from '../testing/gateways.ts';
import { composeRouter } from './composition.ts';

/**
 * Composition validates and builds from one snapshot of its input (docs/adr/0032-live-ai.md, B1
 * repair 1): a getter, Proxy or iterable that answers differently on a later read, a later change
 * to the input, or a write through a returned route cannot place an unregistered provider in a
 * runtime router.
 */
const local = createLocalProvider();
const forgedGenerate = vi.fn(() => Promise.resolve(outputResponse({}, 'forged')));
const forged = testProvider('anthropic', 'remote', forgedGenerate);

/** Composes `routes`, then returns every provider the router holds; throwing is also acceptable. */
function composedProviders(routes: Partial<Record<AiCapability, readonly RoutedProvider[]>>) {
  try {
    const router = composeRouter(routes);
    return (['reasoning', 'npc-dialogue', 'narrative', 'fast-context'] as const).flatMap(
      (capability) => [...router.providersFor(capability)],
    );
  } catch {
    return [];
  }
}

describe('composeRouter', () => {
  it('builds from the same read of a getter it validated', () => {
    let reads = 0;
    const providers = composedProviders({
      get reasoning() {
        reads += 1;
        return reads === 1 ? [local] : [forged, local];
      },
    });

    expect(reads).toBe(1);
    expect(providers).not.toContain(forged);
    expect(providers.every((provider) => isLocalProvider(provider))).toBe(true);
  });

  it('builds from the same pass over an iterable route it validated', () => {
    let passes = 0;
    const route = {
      *[Symbol.iterator]() {
        passes += 1;
        yield* passes === 1 ? [local] : [forged, local];
      },
    } as unknown as readonly RoutedProvider[];
    const providers = composedProviders({ reasoning: route });

    expect(passes).toBe(1);
    expect(providers).not.toContain(forged);
  });

  it('builds from the same read of a Proxy it validated', () => {
    let reads = 0;
    const target: Partial<Record<AiCapability, readonly RoutedProvider[]>> = {};
    const routes = new Proxy(target, {
      ownKeys: () => ['reasoning'],
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      get: () => {
        reads += 1;
        return reads === 1 ? [local] : [forged, local];
      },
    });
    const providers = composedProviders(routes);

    expect(reads).toBe(1);
    expect(providers).not.toContain(forged);
  });

  it('ignores later changes to its input and refuses writes through a route', () => {
    const input: RoutedProvider[] = [local];
    const router = composeRouter({ reasoning: input });
    input[0] = forged;
    const route = router.providersFor('reasoning');

    expect(route).toEqual([local]);
    expect(() => {
      (route as RoutedProvider[])[0] = forged;
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(router, { providersFor: () => [forged] });
    }).toThrow(TypeError);
    expect(router.providersFor('reasoning')).toEqual([local]);
  });
});

describe('the composed gateway over HTTP', () => {
  it('invokes no injected provider, whatever is written to it after composition', async () => {
    const ai = composedGateway(loadConfig({}).ai).gateway;
    expect(() => {
      (ai.router.providersFor('reasoning') as RoutedProvider[])[0] = forged;
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(ai, { router: composeRouter({}) });
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(ai.router, { providersFor: () => [forged] });
    }).toThrow(TypeError);

    const app = await ravenfordApp(await seededEngine(), ai);
    try {
      const response = await post(
        app,
        '/campaigns/ravenford/ai/intents',
        { text: 'Advance time by 1 hour.' },
        TOKENS.dm,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json<DmIntentResponse>().status).toBe('PROPOSED');
    } finally {
      await app.close();
    }
    expect(forgedGenerate).not.toHaveBeenCalled();
  });
});
