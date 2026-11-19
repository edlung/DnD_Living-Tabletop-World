import type {
  AccountResponse,
  CampaignTemplate,
  EnteredCampaignResponse,
  NewAccount,
} from '@ltw/contracts';

/**
 * Accounts from the browser (docs/adr/0041-accounts.md, Stage 600). Like the invitation flow
 * (`sign-in-flow.ts`) every request goes to this origin with the HttpOnly cookies the server sets
 * and script never reads; a password travels only in the body of the request that needs it and
 * is never kept after it. Answers are reduced to what the screens need.
 */
type Transport = typeof fetch;

const TIMEOUT_MS = 30_000;
const JSON_TYPE = 'application/json';

async function send(
  transport: Transport,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = TIMEOUT_MS,
): Promise<Response | null> {
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
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

const post = (
  transport: Transport,
  path: string,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs?: number,
) =>
  send(
    transport,
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': JSON_TYPE, Accept: JSON_TYPE },
      body: JSON.stringify(body),
    },
    signal,
    timeoutMs,
  );

async function json<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * A conflict's reason: a taken login, a seat the account already has, the campaign limit, a DM's
 * account asked to be deleted.
 */
export type ConflictReason =
  'login-taken' | 'already-seated' | 'has-account' | 'campaign-limit' | 'dm-seat';

const reasonOf = async (response: Response): Promise<ConflictReason | null> => {
  const body = await json<{ reason?: unknown }>(response);
  const reason = body?.reason;
  return reason === 'login-taken' ||
    reason === 'already-seated' ||
    reason === 'has-account' ||
    reason === 'campaign-limit' ||
    reason === 'dm-seat'
    ? reason
    : null;
};

export type AccountReading =
  | { readonly kind: 'account'; readonly account: AccountResponse }
  | { readonly kind: 'none' }
  | { readonly kind: 'unreachable' };

/** `GET /account`: the signed-in account with its campaigns, none, or no answer. */
export async function readAccount(
  transport: Transport,
  signal?: AbortSignal,
): Promise<AccountReading> {
  const response = await send(
    transport,
    '/api/account',
    { headers: { Accept: JSON_TYPE } },
    signal,
  );
  if (response === null) return { kind: 'unreachable' };
  // 404: a server without accounts (development personas).
  if (response.status === 401 || response.status === 404) return { kind: 'none' };
  const account = response.ok ? await json<AccountResponse>(response) : null;
  return account ? { kind: 'account', account } : { kind: 'unreachable' };
}

export type SignInAnswer = 'signed-in' | 'refused' | 'limited' | 'unreachable';

/** `POST /auth/sign-in`: every refusal reads the same. */
export async function signInWithPassword(
  transport: Transport,
  login: string,
  password: string,
): Promise<SignInAnswer> {
  const response = await post(transport, '/api/auth/sign-in', { login, password });
  if (response === null) return 'unreachable';
  if (response.ok) return 'signed-in';
  return response.status === 429 ? 'limited' : 'refused';
}

/** `POST /auth/account/sign-out`, ending this browser's campaign session with it. */
export async function signOutAccount(transport: Transport): Promise<boolean> {
  const response = await post(transport, '/api/auth/account/sign-out', {});
  return response !== null && (response.ok || response.status === 401);
}

export type EnterAnswer =
  | { readonly kind: 'entered'; readonly campaignId: string }
  | { readonly kind: 'refused'; readonly reason: ConflictReason | null }
  | { readonly kind: 'unreachable' };

const entered = async (response: Response | null): Promise<EnterAnswer> => {
  if (response === null) return { kind: 'unreachable' };
  if (!response.ok) return { kind: 'refused', reason: await reasonOf(response) };
  const body = await json<EnteredCampaignResponse>(response);
  return body ? { kind: 'entered', campaignId: body.campaignId } : { kind: 'unreachable' };
};

/** Opens one of the account's campaigns: the server sets that campaign's session. */
export const enterCampaign = async (transport: Transport, campaignId: string) =>
  entered(
    await post(transport, `/api/account/campaigns/${encodeURIComponent(campaignId)}/enter`, {}),
  );

/** A new campaign from a ready adventure, the account its DM; its session is set. */
export const createCampaign = async (transport: Transport, template: CampaignTemplate) =>
  entered(await post(transport, '/api/account/campaigns', { template }));

/** One request may wait this long for the server, which waits up to two minutes itself. */
const LIBRARY_REQUEST_MS = 150_000;
/** How long the hub keeps asking before it gives up on a library campaign. */
const LIBRARY_GIVE_UP_MS = 10 * 60_000;

/**
 * A new campaign from the campaign library, the account its DM (ADR 0058, notes of 2026-11-19):
 * the same request ID is sent again while the server answers that it is still preparing it, or
 * that another request of this account is (429), so the creation continues and is never doubled.
 */
export async function createLibraryCampaign(
  transport: Transport,
  pick: { readonly libraryId: string; readonly variantId: string },
  options: { readonly now?: () => number; readonly pause?: (ms: number) => Promise<void> } = {},
): Promise<EnterAnswer> {
  const now = options.now ?? Date.now;
  const pause = options.pause ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const body = { requestId: crypto.randomUUID(), ...pick };
  const giveUp = now() + LIBRARY_GIVE_UP_MS;
  for (;;) {
    const response = await post(
      transport,
      '/api/account/library-campaigns',
      body,
      undefined,
      LIBRARY_REQUEST_MS,
    );
    const again = response !== null && (response.status === 202 || response.status === 429);
    if (!again) return entered(response);
    // Still preparing after ten minutes: the hub says the table could not be reached.
    if (now() >= giveUp) return { kind: 'unreachable' };
    if (response.status === 429) await pause(3000);
  }
}

export type FormAnswer =
  | { readonly kind: 'done' }
  | { readonly kind: 'refused'; readonly reason: ConflictReason | null; readonly status: number }
  | { readonly kind: 'unreachable' };

const formAnswer = async (response: Response | null): Promise<FormAnswer> => {
  if (response === null) return { kind: 'unreachable' };
  if (response.ok) return { kind: 'done' };
  return { kind: 'refused', reason: await reasonOf(response), status: response.status };
};

/** The seat of this browser's live campaign session becomes a new account's. */
export const claimSeat = async (transport: Transport, account: NewAccount) =>
  formAnswer(await post(transport, '/api/auth/claim', account));

/** A reset link's new password. */
export const resetPassword = async (transport: Transport, token: string, password: string) =>
  formAnswer(await post(transport, '/api/auth/reset', { token, password }));

export const changePassword = async (transport: Transport, current: string, next: string) =>
  formAnswer(await post(transport, '/api/account/password', { current, next }));

export const renameAccount = async (transport: Transport, displayName: string) =>
  formAnswer(await post(transport, '/api/account/name', { displayName }));

/** The account forgotten (docs/adr/0062-account-privacy.md §3): its password and login again. */
export const deleteAccount = async (transport: Transport, login: string, password: string) =>
  formAnswer(await post(transport, '/api/account/delete', { login, password }));
