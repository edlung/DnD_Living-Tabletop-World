import { CapabilityRouter, isLocalProvider, snapshotRoutes, type Routes } from '@ltw/ai';

import { isAdmittedProvider } from './admitted-provider.ts';

/**
 * The only way runtime and evaluation build a router (docs/adr/0032-live-ai.md, checkpoint B1).
 * Each entry must be, by object identity, the genuine local provider (`isLocalProvider`, never its
 * `local` ID) or an admitted wrapper registered in the private set of `admitted-provider.ts` (B2).
 * A look-alike with a forged brand, a pure-package test fixture, a wrapper around the local
 * provider or a raw adapter is refused at runtime whatever its TypeScript type. Relevance has no local entry (ADR 0021).
 * Composition reads its input once (`snapshotRoutes`), checks that snapshot, builds the router from
 * the same snapshot and freezes the router, so a getter, Proxy or iterable that answers differently
 * later, or a write after composition, cannot add an unchecked provider (B1 repair 1).
 */

export class CompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompositionError';
  }
}

export function composeRouter(routes: Routes): CapabilityRouter {
  const snapshot = snapshotRoutes(routes);
  for (const [capability, providers] of snapshot) {
    for (const provider of providers) {
      // Identity decides (the local provider is frozen as `local`); an admitted one must be remote.
      const genuine =
        isLocalProvider(provider) || (isAdmittedProvider(provider) && provider.kind === 'remote');
      if (!genuine) throw new CompositionError(`${capability}: a provider not built here`);
    }
    if (capability === 'fast-context' && providers.some((provider) => isLocalProvider(provider))) {
      throw new CompositionError('fast-context: relevance has no local provider');
    }
  }
  const router = new CapabilityRouter(snapshot);
  Object.freeze(router);
  return router;
}
