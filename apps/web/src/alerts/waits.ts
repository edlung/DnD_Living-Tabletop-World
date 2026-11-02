import type { CheckRequestView, EncounterView, RestView } from '@ltw/contracts';

/**
 * What the table waits for from this player (docs/adr/0044-online-play.md §3, plan decision 10):
 * their turn, a reaction asked of them, a check the DM asked for, a short rest to take. Read from
 * the server's views only, so a reload, or a phone that slept, comes back to the same questions.
 */
export type WaitKind = 'reaction' | 'turn' | 'check' | 'rest';

export interface Wait {
  /** One per question: a new turn, window, request or rest is a new key. */
  readonly key: string;
  readonly kind: WaitKind;
}

export function waitsOf({
  encounter,
  actorId,
  requests,
  rest,
  restsTaken,
}: {
  readonly encounter: EncounterView | null;
  /** The character this player acts as; none, nothing waits. */
  readonly actorId: string | null;
  readonly requests: readonly CheckRequestView[];
  readonly rest: RestView | null;
  /** Short rests this player has already gone to. */
  readonly restsTaken: ReadonlySet<string>;
}): Wait[] {
  if (actorId === null) return [];
  const waits: Wait[] = [];
  const window = encounter?.reactionWindow;
  if (window && window.choices.length > 0) {
    waits.push({ key: `reaction:${window.windowId}`, kind: 'reaction' });
  }
  const fighting = encounter?.combatants.some((entry) => entry.entity.entityId === actorId);
  if (encounter && fighting && encounter.currentCombatantId === actorId) {
    waits.push({ key: `turn:${encounter.encounterId}:${String(encounter.round)}`, kind: 'turn' });
  }
  for (const request of requests) {
    if (request.status === 'open' && request.characterId === actorId) {
      waits.push({ key: `check:${request.requestId}`, kind: 'check' });
    }
  }
  if (rest !== null && encounter === null && !restsTaken.has(rest.restId)) {
    waits.push({ key: `rest:${rest.restId}`, kind: 'rest' });
  }
  return waits;
}

/** Keys that were not waiting before: what is news since the last look. */
export function newWaits(before: ReadonlySet<string>, waits: readonly Wait[]): Wait[] {
  return waits.filter((wait) => !before.has(wait.key));
}
