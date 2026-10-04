import type { AiCapability } from '@ltw/contracts';

import type { AiProvider } from './providers.ts';

/**
 * Capability routing (docs/adr/0017-ai-gateway.md §2): each capability maps
 * to an ordered list of providers. The first answers; the fallback policy
 * may try the next one. Domain code asks for a capability, never a model.
 */
export class CapabilityRouter {
  readonly #routes: ReadonlyMap<AiCapability, readonly AiProvider[]>;

  constructor(routes: Partial<Record<AiCapability, readonly AiProvider[]>>) {
    this.#routes = new Map(
      Object.entries(routes).map(([capability, providers]) => [
        capability as AiCapability,
        [...providers],
      ]),
    );
  }

  /** The providers for `capability`, in order; empty when none is configured. */
  providersFor(capability: AiCapability): readonly AiProvider[] {
    return this.#routes.get(capability) ?? [];
  }
}
