import type { AiCapability } from '@ltw/contracts';

import type { RoutedProvider } from './providers.ts';

/**
 * Capability routing (docs/adr/0017-ai-gateway.md §2): each capability maps
 * to an ordered list of providers. The first answers; the fallback policy
 * may switch once to the zero-cost local provider. Domain code asks for a
 * capability, never a model. A route is empty, `[local]`, `[remote]` or
 * `[remote, local]` (docs/adr/0032-live-ai.md, B1): never a second paid
 * provider and never more than one switch. Identity checks of the entries
 * themselves belong to server composition.
 */
export function routeShapeIssue(providers: readonly RoutedProvider[]): string | null {
  const [first, second, ...rest] = providers;
  if (rest.length > 0) return 'a route has at most two providers';
  if (second === undefined) return null;
  return first?.kind === 'remote' && second.kind === 'local'
    ? null
    : 'a two-provider route is one remote provider, then the local provider';
}

export type Routes = Partial<Record<AiCapability, readonly RoutedProvider[]>>;

/** Capability → frozen route, each read exactly once from `routes` (getters, Proxies, iterables). */
export type RouteSnapshot = ReadonlyMap<AiCapability, readonly RoutedProvider[]>;

const NO_ROUTE: readonly RoutedProvider[] = Object.freeze([]);

/**
 * Reads every route of `routes` once into frozen arrays, so a check and the router it builds see
 * the same providers (docs/adr/0032-live-ai.md, B1 repair 1). Later reads or changes of the input
 * cannot reach the snapshot.
 */
export function snapshotRoutes(routes: Routes | RouteSnapshot): RouteSnapshot {
  const entries =
    routes instanceof Map
      ? [...(routes as RouteSnapshot)]
      : (Object.entries(routes) as [AiCapability, readonly RoutedProvider[]][]);
  return new Map(
    entries.map(([capability, providers]) => [capability, Object.freeze(Array.from(providers))]),
  );
}

export class CapabilityRouter {
  readonly #routes: RouteSnapshot;

  /** Checks and keeps one snapshot of `routes`; a snapshot passed in is copied, not re-read. */
  constructor(routes: Routes | RouteSnapshot) {
    const snapshot = snapshotRoutes(routes);
    for (const [capability, providers] of snapshot) {
      const issue = routeShapeIssue(providers);
      if (issue !== null) throw new Error(`${capability}: ${issue}`);
    }
    this.#routes = snapshot;
  }

  /** The providers for `capability`, in order and frozen; empty when none is configured. */
  providersFor(capability: AiCapability): readonly RoutedProvider[] {
    return this.#routes.get(capability) ?? NO_ROUTE;
  }
}
