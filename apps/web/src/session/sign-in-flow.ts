import { OBJECT_ID_PATTERN } from '@ltw/contracts';
import type { GameSignOutGuard } from '../api/client.ts';

import { holdInvitation, type InvitationHolder } from './invitation-link.ts';

/**
 * Production sign-in from the browser (docs/adr/0036-production-sign-in.md §2–3, §7;
 * docs/STAGE_340_DESIGN.md "Browser", "Security review fixes", "Part B review fixes"). Every
 * request goes to this origin with `credentials: 'same-origin'` and no `Authorization` header:
 * the session is the HttpOnly cookie the server sets, which script never reads. A token travels
 * only in the body of `POST /auth/redeem`, sent only when the person takes their seat, never in a
 * URL. Answers are reduced to what the screens need; a refusal's reason is never shown (every
 * failed invitation reads the same).
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

/** An answer's JSON, or undefined when it is none. */
async function bodyOf(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** The campaign of a sign-in answer (`{campaignId}`), or null when the answer is not one. */
function campaignOf(data: unknown): string | null {
  return typeof data === 'object' &&
    data !== null &&
    'campaignId' in data &&
    typeof data.campaignId === 'string' &&
    OBJECT_ID_PATTERN.test(data.campaignId)
    ? data.campaignId
    : null;
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
  const campaignId = campaignOf(await bodyOf(response));
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
  const campaignId = campaignOf(await bodyOf(response));
  return campaignId === null ? { kind: 'failed' } : { kind: 'joined', campaignId };
}

/** `POST /auth/sign-out`: ended, or still signed in because the server was not reached. */
export async function signOut(
  transport: Transport,
  mounted?: GameSignOutGuard,
  signal?: AbortSignal,
): Promise<'signed-out' | 'failed'> {
  const response = await send(
    transport,
    '/api/auth/sign-out',
    {
      method: 'POST',
      headers: {
        'Content-Type': JSON_TYPE,
        ...(mounted ? { 'x-game-campaign': mounted.campaignId } : {}),
        ...(mounted?.actorId ? { 'x-game-actor': mounted.actorId } : {}),
      },
      body: '{}',
    },
    signal,
  );
  // A 401 means no session was left to end: signed out all the same.
  return response !== null &&
    (response.ok || response.status === 401 || (mounted !== undefined && response.status === 409))
    ? 'signed-out'
    : 'failed';
}

/** Whose world a sign-in opens: the campaign, the actor, the role and the character. */
export interface SignInIdentity {
  readonly campaignId: string;
  readonly actorId: string;
  readonly role: 'DM' | 'PLAYER';
  readonly characterId: string | null;
}

/** The sign-in this browser holds, as the person knows it: the campaign and who they are there. */
export interface CurrentSignIn {
  readonly campaignName: string;
  readonly role: 'DM' | 'PLAYER';
  readonly characterName: string | null;
}

/** A campaign's `session` view, reduced to who it names; null when it is not one. */
function identityOf(data: unknown, campaignId: string): (SignInIdentity & CurrentSignIn) | null {
  if (typeof data !== 'object' || data === null) return null;
  const view = data as {
    readonly actorId?: unknown;
    readonly role?: unknown;
    readonly campaign?: { readonly campaignId?: unknown; readonly name?: unknown } | null;
    readonly character?: { readonly entityId?: unknown; readonly name?: unknown } | null;
  };
  const { actorId, role } = view;
  const name = view.campaign?.campaignId === campaignId ? view.campaign.name : undefined;
  const character = view.character ?? null;
  const characterId = character === null ? null : character.entityId;
  if (
    typeof actorId !== 'string' ||
    (role !== 'DM' && role !== 'PLAYER') ||
    typeof name !== 'string' ||
    (characterId !== null && typeof characterId !== 'string')
  ) {
    return null;
  }
  return {
    campaignId,
    campaignName: name,
    actorId,
    role,
    characterId,
    characterName: typeof character?.name === 'string' ? character.name : null,
  };
}

/** Who the server says this browser is signed in as now, or that it is not, or no answer. */
export type SignInReading =
  | { readonly kind: 'signed-in'; readonly identity: SignInIdentity & CurrentSignIn }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'unknown' };

const UNKNOWN: SignInReading = { kind: 'unknown' };

/** A campaign's `session` view: who this browser is signed in as there. */
export async function readIdentity(
  transport: Transport,
  campaignId: string,
  signal?: AbortSignal,
): Promise<SignInReading> {
  const response = await send(
    transport,
    `/api/campaigns/${encodeURIComponent(campaignId)}/session`,
    { headers: { Accept: JSON_TYPE } },
    signal,
  );
  if (response === null) return UNKNOWN;
  // Signed out, or no longer at that table.
  if (response.status === 401 || response.status === 404) return { kind: 'signed-out' };
  if (!response.ok) return UNKNOWN;
  const identity = identityOf(await bodyOf(response), campaignId);
  return identity === null ? UNKNOWN : { kind: 'signed-in', identity };
}

/** `GET /auth/session`, then that campaign's `session` view: who this browser is signed in as. */
export async function readSignIn(
  transport: Transport,
  signal?: AbortSignal,
): Promise<SignInReading> {
  const probe = await probeSession(transport, signal);
  if (probe.kind === 'signed-out') return { kind: 'signed-out' };
  if (probe.kind !== 'signed-in') return UNKNOWN;
  return readIdentity(transport, probe.campaignId, signal);
}

/** Names the browser's current sign-in, or null when there is none (or it cannot be read). */
export async function describeSignIn(
  transport: Transport,
  signal?: AbortSignal,
): Promise<CurrentSignIn | null> {
  const reading = await readSignIn(transport, signal);
  if (reading.kind !== 'signed-in') return null;
  const { campaignName, role, characterName } = reading.identity;
  return { campaignName, role, characterName };
}

/**
 * How the page begins (`main.tsx`). Without an invitation its first request — whether this
 * browser is signed in — was sent once when the page loaded, and the screen only awaits the
 * answer, so React's repeated development effects never send it twice. A join link sends
 * nothing: its invitation waits in a one-shot holder until the person takes their seat, and a
 * fragment that is no token fails without a request.
 */
export type PageStart =
  | { readonly kind: 'probe'; readonly first: Promise<SessionProbe> }
  | { readonly kind: 'invited'; readonly invitation: InvitationHolder }
  | { readonly kind: 'malformed' };

export function pageStart(
  invitation: InvitationHolder | 'malformed' | null,
  transport: Transport,
): PageStart {
  if (invitation === null) return { kind: 'probe', first: probeSession(transport) };
  return invitation === 'malformed' ? { kind: 'malformed' } : { kind: 'invited', invitation };
}

/** What taking the seat came to. */
export type SeatOutcome =
  | { readonly kind: 'joined'; readonly campaignId: string }
  /**
   * This browser is signed in already: the person is asked first, and `replacement` holds the
   * token for that question alone (one-shot: kept or replaced, it is gone).
   */
  | { readonly kind: 'needs-confirmation'; readonly replacement: InvitationHolder }
  | { readonly kind: 'failed' };

/**
 * "Take your seat": the one redeem of the held invitation, sent only on the person's click. The
 * holder is spent by it, so a second press sends nothing (null).
 */
export async function takeSeat(
  invitation: InvitationHolder,
  transport: Transport,
): Promise<SeatOutcome | null> {
  const token = invitation.take();
  if (token === null) return null;
  const outcome = await redeemInvitation(transport, token, false);
  return outcome.kind === 'needs-confirmation'
    ? { kind: 'needs-confirmation', replacement: holdInvitation(token) }
    : outcome;
}

/** "Replace with this invitation", confirmed: the token's last use; null once it is gone. */
export async function replaceSignIn(
  replacement: InvitationHolder,
  transport: Transport,
): Promise<Exclude<SeatOutcome, { readonly kind: 'needs-confirmation' }> | null> {
  const token = replacement.take();
  if (token === null) return null;
  const outcome = await redeemInvitation(transport, token, true);
  return outcome.kind === 'joined' ? outcome : { kind: 'failed' };
}
