import type { CreatedInvitationResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import {
  ACCOUNT_LIMITS,
  AccountLimits,
  type AccountLimitSettings,
} from '../accounts/account-limits.ts';
import { InMemoryAccountStore } from '../accounts/account-store.ts';
import { displayAuthenticator, personOrDisplay } from '../display/display-authenticator.ts';
import { DISPLAY_LIMITS, DisplayLimits } from '../display/display-limits.ts';
import { InMemoryDisplayStore } from '../display/display-store.ts';
import { OpenTableLinks } from '../display/table-links.ts';

import { InMemoryCredentialStore, type CredentialStore } from '../auth/credential-store.ts';
import { RequestLimits, SIGN_IN_LIMITS, type LimitSettings } from '../auth/limits.ts';
import { issueDmInvitation } from '../auth/operator.ts';
import { sessionAuthenticator, type AuthClock } from '../auth/session-authenticator.ts';
import type { SignInDependencies } from '../auth/sign-in.ts';
import { evidenceHasher } from '../auth/tokens.ts';
import type { LiveHub } from '../live/hub.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';
import { buildLiveApp } from '../live/live-app.ts';
import { createLogger, type Logger } from '../platform/logging/logger.ts';
import { ManualTimers } from './live.ts';
import {
  RAVENFORD_QUESTS,
  RAVENFORD_QUESTS_BY_LANGUAGE,
  RAVENFORD_PREPARED,
  seededEngine,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
} from './ravenford-app.ts';

/**
 * Test support (excluded from builds): the production composition in invitation mode
 * (docs/adr/0036-production-sign-in.md) over a seeded Ravenford with in-memory credentials, a
 * manual sign-in clock and a manual live clock. Ravenford gains an empty seat (Seren Ashgrove);
 * a second campaign (`other-table`) has the same DM and a seat of its own.
 */
export const ORIGIN = 'https://table.example';
export const SEREN = 'seren-ashgrove';
export const OTHER_CAMPAIGN = 'other-table';
export const OTHER_SEAT = 'other-hero';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

export class ManualClock implements AuthClock {
  #now = Date.parse('2026-10-15T18:00:00.000Z');
  now = (): number => this.#now;
  advance(ms: number): void {
    this.#now += ms;
  }
}

export interface Caller {
  readonly cookie?: string;
  readonly origin?: string | null;
  readonly ip?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface SignInTable {
  readonly app: FastifyInstance;
  readonly ai: ReturnType<typeof testAiGateway>;
  readonly hub: LiveHub;
  readonly timers: ManualTimers;
  readonly engine: WorldEngine;
  readonly credentials: CredentialStore;
  readonly accounts: InMemoryAccountStore;
  readonly displays: InMemoryDisplayStore;
  readonly clock: ManualClock;
  readonly signIn: SignInDependencies;
  /** A request as a browser on the public origin sends it, unless told otherwise. */
  readonly send: (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    caller?: Caller,
    body?: unknown,
  ) => Promise<LightMyRequestResponse>;
  /** The operator's DM invitation for a campaign: its token. */
  readonly dmInvitation: (campaignId?: string, hours?: number) => Promise<string>;
  /** `POST /auth/redeem`, with any further body fields (`replaceSession`). */
  readonly redeem: (
    token: string,
    caller?: Caller,
    extra?: Readonly<Record<string, unknown>>,
  ) => Promise<LightMyRequestResponse>;
  /** Redeems a token that must work: the session cookie to send back. */
  readonly signInWith: (
    token: string,
    caller?: Caller,
    extra?: Readonly<Record<string, unknown>>,
  ) => Promise<string>;
  /** The DM invites a player for a seat: the invitation and its token. */
  readonly invite: (
    dmCookie: string,
    characterId: string,
    campaignId?: string,
    expiresHours?: number,
  ) => Promise<{ readonly invitation: CreatedInvitationResponse; readonly token: string }>;
}

/**
 * A credential store whose redeem completion fails while `failures` is above zero (a lost
 * connection after the World Engine seated the player), or lets something happen just before
 * it; everything else is the inner store's.
 */
export class FlakyCredentialStore implements CredentialStore {
  failures = 0;
  /** Runs once just before the next redeem completes (something happening meanwhile). */
  beforeComplete: (() => Promise<void>) | null = null;
  readonly #inner: CredentialStore;

  constructor(inner: CredentialStore) {
    this.#inner = inner;
  }

  createSession(...args: Parameters<CredentialStore['createSession']>): Promise<void> {
    return this.#inner.createSession(...args);
  }

  async completeRedeem(...args: Parameters<CredentialStore['completeRedeem']>): Promise<boolean> {
    const meanwhile = this.beforeComplete;
    this.beforeComplete = null;
    await meanwhile?.();
    if (this.failures === 0) return this.#inner.completeRedeem(...args);
    this.failures -= 1;
    throw new Error('connection lost');
  }

  createInvitation = (...args: Parameters<CredentialStore['createInvitation']>) =>
    this.#inner.createInvitation(...args);
  findInvitation = (...args: Parameters<CredentialStore['findInvitation']>) =>
    this.#inner.findInvitation(...args);
  claimActor = (...args: Parameters<CredentialStore['claimActor']>) =>
    this.#inner.claimActor(...args);
  findSession = (...args: Parameters<CredentialStore['findSession']>) =>
    this.#inner.findSession(...args);
  touchSession = (...args: Parameters<CredentialStore['touchSession']>) =>
    this.#inner.touchSession(...args);
  revokeSession = (...args: Parameters<CredentialStore['revokeSession']>) =>
    this.#inner.revokeSession(...args);
  revokeActorSessions = (...args: Parameters<CredentialStore['revokeActorSessions']>) =>
    this.#inner.revokeActorSessions(...args);
  revokeSessionsEverywhere = (...args: Parameters<CredentialStore['revokeSessionsEverywhere']>) =>
    this.#inner.revokeSessionsEverywhere(...args);
  revokeActorInvitations = (...args: Parameters<CredentialStore['revokeActorInvitations']>) =>
    this.#inner.revokeActorInvitations(...args);
  liveSessions = (...args: Parameters<CredentialStore['liveSessions']>) =>
    this.#inner.liveSessions(...args);
  revokeCharacterInvitations = (
    ...args: Parameters<CredentialStore['revokeCharacterInvitations']>
  ) => this.#inner.revokeCharacterInvitations(...args);
  revokeInvitation = (...args: Parameters<CredentialStore['revokeInvitation']>) =>
    this.#inner.revokeInvitation(...args);
  listInvitations = (...args: Parameters<CredentialStore['listInvitations']>) =>
    this.#inner.listInvitations(...args);
  sessionSummaries = (...args: Parameters<CredentialStore['sessionSummaries']>) =>
    this.#inner.sessionSummaries(...args);
  recordAttempt = (...args: Parameters<CredentialStore['recordAttempt']>) =>
    this.#inner.recordAttempt(...args);
  prune = (...args: Parameters<CredentialStore['prune']>) => this.#inner.prune(...args);
}

/** The `ltw_session=<token>` pair of a response's `Set-Cookie`, or null. */
export function sessionCookieOf(response: LightMyRequestResponse): string | null {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  const pair = value?.split(';')[0] ?? '';
  return /^ltw_session=[A-Za-z0-9_-]{43}$/.test(pair) ? pair : null;
}

export const tokenOfLink = (link: string): string => link.slice(link.indexOf('#') + 1);

export async function signInTable(
  options: {
    readonly limits?: Partial<LimitSettings>;
    readonly accountLimits?: Partial<AccountLimitSettings>;
    readonly logger?: Logger;
    readonly credentials?: CredentialStore;
    readonly engine?: WorldEngine;
    readonly ai?: ReturnType<typeof testAiGateway>;
    readonly workshop?: WorkshopDependencies;
    /** `LTW_TRUST_PROXY`: the reverse proxy whose `X-Forwarded-For` names the client. */
    readonly trustedProxies?: readonly string[];
  } = {},
): Promise<SignInTable> {
  const engine = options.engine ?? (await seededEngine());
  await seat(engine);
  const clock = new ManualClock();
  const timers = new ManualTimers();
  const credentials = options.credentials ?? new InMemoryCredentialStore();
  const accounts = new InMemoryAccountStore();
  const displays = new InMemoryDisplayStore();
  const signIn: SignInDependencies = {
    credentials,
    publicOrigin: ORIGIN,
    clock,
    limits: new RequestLimits({ ...SIGN_IN_LIMITS, ...options.limits }, clock.now),
    evidence: evidenceHasher(),
    accounts,
    accountLimits: new AccountLimits({ ...ACCOUNT_LIMITS, ...options.accountLimits }, clock.now),
    displays,
    displayLimits: new DisplayLimits(DISPLAY_LIMITS, clock.now),
    openLinks: new OpenTableLinks(),
  };
  const ai = options.ai ?? testAiGateway();
  const { app, hub } = buildLiveApp(
    {
      ai,
      authoring: testAuthoring(),
      dm: testDm(),
      assets: testAssets(),
      quests: RAVENFORD_QUESTS,
      questsByLanguage: RAVENFORD_QUESTS_BY_LANGUAGE,
      preparedEncounters: RAVENFORD_PREPARED,
      engine,
      authenticator: personOrDisplay(
        sessionAuthenticator(credentials, clock),
        displayAuthenticator(displays, clock),
      ),
      logger: options.logger ?? createLogger({ service: 'sign-in-test', level: 'silent' }),
      signIn,
      ...(options.workshop ? { workshop: options.workshop } : {}),
      ...(options.trustedProxies === undefined ? {} : { trustedProxies: options.trustedProxies }),
    },
    { timers },
  );
  await app.ready();

  const send: SignInTable['send'] = (method, url, caller = {}, body) =>
    app.inject({
      method,
      url,
      remoteAddress: caller.ip ?? '203.0.113.7',
      headers: {
        ...(caller.origin === null ? {} : { origin: caller.origin ?? ORIGIN }),
        ...(caller.cookie === undefined ? {} : { cookie: caller.cookie }),
        ...caller.headers,
      },
      ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
    });
  const redeem: SignInTable['redeem'] = (token, caller, extra) =>
    send('POST', '/auth/redeem', caller, { token, ...extra });
  const signInWith: SignInTable['signInWith'] = async (token, caller, extra) => {
    const response = await redeem(token, caller, extra);
    const cookie = sessionCookieOf(response);
    if (response.statusCode !== 200 || cookie === null) {
      throw new Error(`sign-in refused: ${String(response.statusCode)}`);
    }
    return cookie;
  };
  return {
    app,
    ai,
    hub,
    timers,
    engine,
    credentials,
    accounts,
    displays,
    clock,
    signIn,
    send,
    redeem,
    signInWith,
    dmInvitation: async (campaignId = 'ravenford', hours = 72) => {
      const issued = await issueDmInvitation(engine, signIn, {
        kind: 'dm-invite',
        campaignId,
        expiresHours: hours,
      });
      return tokenOfLink(issued.link);
    },
    invite: async (dmCookie, characterId, campaignId = 'ravenford', expiresHours) => {
      const response = await send(
        'POST',
        `/campaigns/${campaignId}/invitations`,
        { cookie: dmCookie },
        { characterId, ...(expiresHours === undefined ? {} : { expiresHours }) },
      );
      if (response.statusCode !== 201) {
        throw new Error(`invitation refused: ${String(response.statusCode)}`);
      }
      const invitation = response.json<CreatedInvitationResponse>();
      return { invitation, token: tokenOfLink(invitation.link) };
    },
  };
}

/** Ravenford's empty seat and the second campaign (idempotent: fixed command IDs). */
async function seat(engine: WorldEngine): Promise<void> {
  const steps: [string, string, Record<string, unknown>][] = [
    [
      'ravenford',
      'seren',
      {
        type: 'CreateEntity',
        entityId: SEREN,
        kind: 'character',
        name: 'Seren Ashgrove',
        existsSince: null,
        placement: { locationId: 'market-square', since: null },
      },
    ],
    [
      OTHER_CAMPAIGN,
      'campaign',
      { type: 'CreateCampaign', name: 'Other Table', worldName: 'Elsewhere', startsAt: 32_400 },
    ],
    [
      OTHER_CAMPAIGN,
      'seat',
      {
        type: 'CreateEntity',
        entityId: OTHER_SEAT,
        kind: 'character',
        name: 'Other',
        existsSince: null,
      },
    ],
  ];
  for (const [campaignId, name, command] of steps) {
    const result = await engine.execute({
      commandId: `sign-in-test.${campaignId}.${name}`,
      campaignId,
      actor: DM,
      command,
    });
    if (result.status === 'rejected') throw new Error(`sign-in seat ${name}: ${result.code}`);
  }
}
