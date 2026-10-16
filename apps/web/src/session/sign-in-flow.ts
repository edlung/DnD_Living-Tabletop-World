import { OBJECT_ID_PATTERN } from '@ltw/contracts';

import type { Invitation } from './invitation-link.ts';

/**
 * Production sign-in from the browser (docs/adr/0036-production-sign-in.md §2–3, §7;
 * docs/STAGE_340_DESIGN.md "Browser", "Security review fixes"). Every request goes to this
 * origin with `credentials: 'same-origin'` and no `Authorization` header: the session is the
 * HttpOnly cookie the server sets, which script never reads. A token travels only in the body
 * of `POST /auth/redeem`, never in a URL. Answers are reduced to what the screens need; a
 * refusal's reason is never shown (every failed invitation reads the same).
 */
type Transport = typeof fetch;

const TIMEOUT_MS = 15_000;
const JSON_TYPE = 'application/json';

/** One same-origin request; null when it never got an answer. */
async function send(
  transport: Transport,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response | null> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    // Called without a receiver, as the browser's own `fetch` requires.
    const call = transport;
    return await call(path, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
    });
  } catch {
    return null;
  }
}

/** The campaign of a sign-in answer (`{campaignId}`), or null when the answer is not one. */
async function campaignOf(response: Response): Promise<string | null> {
  try {
    const data: unknown = await response.json();
    if (
      typeof data === 'object' &&
      data !== null &&
      'campaignId' in data &&
      typeof data.campaignId === 'string' &&
      OBJECT_ID_PATTERN.test(data.campaignId)
    ) {
      return data.campaignId;
    }
  } catch {
    // Not JSON: not a sign-in answer.
  }
  return null;
}

/**
 * What `GET /auth/session` says about this browser: signed in to a campaign, signed out, a
 * server without production sign-in (development personas: the route does not exist), or no
 * answer.
 */
export type SessionProbe =
  | { readonly kind: 'signed-in'; readonly campaignId: string }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'personas' }
  | { readonly kind: 'unreachable' };

export async function probeSession(
  transport: Transport,
  signal?: AbortSignal,
): Promise<SessionProbe> {
  const response = await send(
    transport,
    '/api/auth/session',
    { headers: { Accept: JSON_TYPE } },
    signal,
  );
  if (response === null) return { kind: 'unreachable' };
  if (response.status === 401) return { kind: 'signed-out' };
  if (response.status === 404) return { kind: 'personas' };
  if (!response.ok) return { kind: 'unreachable' };
  const campaignId = await campaignOf(response);
  return campaignId === null ? { kind: 'unreachable' } : { kind: 'signed-in', campaignId };
}

/**
 * `POST /auth/redeem`. A browser already signed in gets 409 until it confirms replacing that
 * sign-in (`replaceSession`, sent only after the person said yes). Anything else that is not a
 * sign-in — refused, limited, malformed, unanswered — is one failure, whatever its reason.
 */
export type RedeemOutcome =
  | { readonly kind: 'joined'; readonly campaignId: string }
  | { readonly kind: 'needs-confirmation' }
  | { readonly kind: 'failed' };

export async function redeemInvitation(
  transport: Transport,
  token: string,
  replaceSession: boolean,
): Promise<RedeemOutcome> {
  const response = await send(transport, '/api/auth/redeem', {
    method: 'POST',
    headers: { 'Content-Type': JSON_TYPE, Accept: JSON_TYPE },
    body: JSON.stringify(replaceSession ? { token, replaceSession: true } : { token }),
  });
  if (response === null) return { kind: 'failed' };
  if (response.status === 409 && !replaceSession) return { kind: 'needs-confirmation' };
  if (!response.ok) return { kind: 'failed' };
  const campaignId = await campaignOf(response);
  return campaignId === null ? { kind: 'failed' } : { kind: 'joined', campaignId };
}

/** `POST /auth/sign-out`: ended, or still signed in because the server was not reached. */
export async function signOut(transport: Transport): Promise<'signed-out' | 'failed'> {
  const response = await send(transport, '/api/auth/sign-out', {
    method: 'POST',
    headers: { 'Content-Type': JSON_TYPE },
    body: '{}',
  });
  // A 401 means no session was left to end: signed out all the same.
  return response !== null && (response.ok || response.status === 401) ? 'signed-out' : 'failed';
}

/** The sign-in this browser holds, as the person knows it: the campaign and who they are there. */
export interface CurrentSignIn {
  readonly campaignName: string;
  readonly role: 'DM' | 'PLAYER';
  readonly characterName: string | null;
}

/** Names the browser's current sign-in, or null when there is none (or it cannot be read). */
export async function describeSignIn(
  transport: Transport,
  signal?: AbortSignal,
): Promise<CurrentSignIn | null> {
  const probe = await probeSession(transport, signal);
  if (probe.kind !== 'signed-in') return null;
  const response = await send(
    transport,
    `/api/campaigns/${encodeURIComponent(probe.campaignId)}/session`,
    { headers: { Accept: JSON_TYPE } },
    signal,
  );
  if (response === null || !response.ok) return null;
  try {
    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null) return null;
    const identity = data as {
      readonly role?: unknown;
      readonly campaign?: { readonly name?: unknown };
      readonly character?: { readonly name?: unknown } | null;
    };
    const name = identity.campaign?.name;
    const role = identity.role;
    if (typeof name !== 'string' || (role !== 'DM' && role !== 'PLAYER')) return null;
    const character = identity.character?.name;
    return {
      campaignName: name,
      role,
      characterName: typeof character === 'string' ? character : null,
    };
  } catch {
    return null;
  }
}

/** Where the page starts: a session probe's answer or an invitation's. */
export type FirstStep =
  | SessionProbe
  | { readonly kind: 'joined'; readonly campaignId: string }
  | { readonly kind: 'join-failed' }
  /** This browser is signed in already: the person is asked before `token` replaces that. */
  | { readonly kind: 'confirm'; readonly token: string };

/**
 * What the page does first, exactly once per load (`main.tsx`): redeem the invitation the
 * address held, or find out whether this browser is signed in. The screen only awaits the
 * answer, so React's repeated development effects never send an invitation twice. A join link
 * whose fragment is no token fails without a request.
 */
export async function firstStep(
  invitation: Invitation | null,
  transport: Transport,
): Promise<FirstStep> {
  if (invitation === null) return probeSession(transport);
  if (invitation.kind === 'malformed') return { kind: 'join-failed' };
  const outcome = await redeemInvitation(transport, invitation.token, false);
  switch (outcome.kind) {
    case 'joined':
      return outcome;
    case 'needs-confirmation':
      return { kind: 'confirm', token: invitation.token };
    case 'failed':
      return { kind: 'join-failed' };
  }
}
