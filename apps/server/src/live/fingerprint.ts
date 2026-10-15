import { createHash } from 'node:crypto';

import type { LiveCloseReason } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';

import type { Authenticator } from '../http/auth.ts';
import { coverageInventory, type LiveTarget, type ViewRequest } from './inventory.ts';

/**
 * A subscription's fingerprint (docs/adr/0033-live-session.md §2): SHA-256 over the bodies of
 * its coverage views, each obtained by injecting a GET with the subscriber's own credential
 * into the silent second application. The existing authentication, check order, membership,
 * perspective and projection code answer every request; nothing here decides visibility, and
 * no raw state, history, hidden identifier or event metadata is hashed.
 */
export type Verdict =
  | { readonly kind: 'fingerprint'; readonly value: string }
  | {
      readonly kind: 'close';
      readonly reason: Extract<LiveCloseReason, 'unauthenticated' | 'forbidden' | 'gone'>;
    };

export type Injector = Pick<FastifyInstance, 'inject'>;

export interface SubscriptionKey {
  readonly target: LiveTarget;
  /** The subscriber's `Authorization` header: held in memory, never logged or hashed. */
  readonly authorization: string;
  readonly actorId: string;
}

const close = (reason: Extract<Verdict, { kind: 'close' }>['reason']): Verdict => ({
  kind: 'close',
  reason,
});

/**
 * The check order of ADR 0009 through the views themselves: any 401 closes with
 * `unauthenticated`, any 403 with `forbidden`; a 404 of an always-present view or any other
 * failure with `gone`. An error never yields a fingerprint, so it never yields a signal.
 */
export async function fingerprintViews(
  mirror: Injector,
  authorization: string,
  views: readonly ViewRequest[],
): Promise<Verdict> {
  const responses = await Promise.all(
    views.map((view) =>
      mirror.inject({ method: 'GET', url: view.url, headers: { authorization } }),
    ),
  );
  const statuses = responses.map((response) => response.statusCode);
  if (statuses.includes(401)) return close('unauthenticated');
  if (statuses.includes(403)) return close('forbidden');
  const digests: string[] = [];
  for (const [index, view] of views.entries()) {
    const response = responses[index];
    if (!response) return close('gone');
    const shown = response.statusCode === 200;
    if (!shown && !(view.optional && response.statusCode === 404)) return close('gone');
    digests.push(
      createHash('sha256')
        .update(view.url)
        .update('\0')
        .update(String(response.statusCode))
        .update('\0')
        // A not-visible focus or place is its status alone (error bodies carry request IDs).
        .update(shown ? response.body : '')
        .digest('hex'),
    );
  }
  return {
    kind: 'fingerprint',
    value: createHash('sha256').update(digests.join('\n')).digest('hex'),
  };
}

/**
 * The full recheck of one subscription. Beyond the views, the credential must still identify
 * the subscriber it was opened for (presence and caps count that actor).
 */
export async function fingerprintSubscription(
  mirror: Injector,
  authenticator: Authenticator,
  subscription: SubscriptionKey,
): Promise<Verdict> {
  const verdict = await fingerprintViews(
    mirror,
    subscription.authorization,
    coverageInventory(subscription.target),
  );
  if (verdict.kind === 'close') return verdict;
  const actor = authenticator.authenticate(subscription.authorization);
  return actor?.actorId === subscription.actorId ? verdict : close('unauthenticated');
}
