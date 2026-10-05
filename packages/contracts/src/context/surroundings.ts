import type { ContextEntityRef } from './views.ts';

/** Current perceived locations; an unknown place has no disclosed name. */
export interface SurroundingsResponse {
  readonly perspective: string;
  readonly actingCharacterId: string;
  readonly location: ContextEntityRef | null;
  /** Perceived locations other than the current place, including its parent and children. */
  readonly nearby: readonly ContextEntityRef[];
}
