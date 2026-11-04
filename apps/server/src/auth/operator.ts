import { MAX_INVITATION_HOURS, actorIdSchema, campaignIdSchema, loginSchema } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';

import { issueReset } from '../accounts/accounts.ts';
import { forgetAccount } from '../accounts/privacy.ts';
import { iso } from './session-authenticator.ts';
import { issueInvitation, type IssuedInvitation, type SignInDependencies } from './sign-in.ts';

/**
 * The operator's sign-in commands (`pnpm auth:operator`; docs/adr/0036-production-sign-in.md
 * §1 and its amendment 2026-10-16). The only way to DM access in production is a DM invitation
 * the operator issues for a campaign's `dmActorId`; the operator also revokes the DM's sessions
 * (the DM cannot revoke themselves through the members route), signs one actor out everywhere,
 * and lists a campaign's live sessions. Arguments are explicit and strict; nothing has a
 * default. A revocation names the authorization it is done under, echoed in its one output
 * line. Outputs never hold a token or a hash.
 */
export type AuthOperatorCommand =
  | {
      readonly kind: 'dm-invite';
      readonly campaignId: string;
      readonly expiresHours: number;
    }
  | {
      readonly kind: 'revoke-dm';
      readonly campaignId: string;
      readonly authorizationSource: string;
    }
  | {
      readonly kind: 'revoke-actor';
      readonly actorId: string;
      readonly authorizationSource: string;
    }
  | { readonly kind: 'sessions'; readonly campaignId: string }
  | { readonly kind: 'reset-password'; readonly login: string }
  | {
      readonly kind: 'delete-account';
      readonly login: string;
      readonly authorizationSource: string;
    };

export class AuthOperatorUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthOperatorUsageError';
  }
}

export type AuthOperatorRefusalCode =
  'CAMPAIGN_NOT_FOUND' | 'INVITATIONS_MODE_REQUIRED' | 'ACCOUNT_NOT_FOUND';

/** A refusal with a fixed code, never echoing input. */
export class AuthOperatorRefusal extends Error {
  readonly code: AuthOperatorRefusalCode;
  constructor(code: AuthOperatorRefusalCode) {
    super(code);
    this.name = 'AuthOperatorRefusal';
    this.code = code;
  }
}

const FLAGS = {
  'dm-invite': ['campaign', 'expires-hours'],
  'revoke-dm': ['campaign', 'authorization-source'],
  'revoke-actor': ['actor', 'authorization-source'],
  sessions: ['campaign'],
  'reset-password': ['login'],
  'delete-account': ['login', 'authorization-source'],
} as const satisfies Record<AuthOperatorCommand['kind'], readonly string[]>;

const isKind = (value: string | undefined): value is AuthOperatorCommand['kind'] =>
  value !== undefined && Object.hasOwn(FLAGS, value);

function readFlags(kind: AuthOperatorCommand['kind'], rest: readonly string[]) {
  const allowed = new Set<string>(FLAGS[kind]);
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] ?? '';
    const name = flag.slice(2);
    if (!flag.startsWith('--') || !allowed.has(name)) {
      throw new AuthOperatorUsageError(
        `${kind} does not take ${flag.startsWith('--') ? flag : 'that argument'}`,
      );
    }
    if (values.has(name)) throw new AuthOperatorUsageError(`--${name} given twice`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new AuthOperatorUsageError(`--${name} needs a value`);
    }
    values.set(name, value);
  }
  return (name: (typeof FLAGS)[typeof kind][number]): string => {
    const value = values.get(name);
    if (value === undefined) throw new AuthOperatorUsageError(`--${name} is required`);
    return value;
  };
}

function campaignOf(value: string): string {
  if (!campaignIdSchema.safeParse(value).success) {
    throw new AuthOperatorUsageError('--campaign must be a campaign ID');
  }
  return value;
}

/** Who asked for a revocation, and where: a durable reference (an owner message, a ticket). */
function authorizationSourceOf(value: string): string {
  const source = value.trim();
  // Control characters (a newline among them) would forge lines of the operator's record.
  if (source === '' || source.length > 200 || /\p{Cc}/u.test(value)) {
    throw new AuthOperatorUsageError('--authorization-source must be 1-200 printable characters');
  }
  return source;
}

export function parseAuthOperatorArgs(argv: readonly string[]): AuthOperatorCommand {
  const [kind, ...rest] = argv;
  if (!isKind(kind)) {
    throw new AuthOperatorUsageError(`commands: ${Object.keys(FLAGS).join(', ')}`);
  }
  const flag = readFlags(kind, rest);
  switch (kind) {
    case 'dm-invite': {
      const campaignId = campaignOf(flag('campaign'));
      const hours = flag('expires-hours');
      if (!/^[1-9][0-9]{0,2}$/.test(hours) || Number(hours) > MAX_INVITATION_HOURS) {
        throw new AuthOperatorUsageError(
          `--expires-hours must be 1-${String(MAX_INVITATION_HOURS)}`,
        );
      }
      return { kind, campaignId, expiresHours: Number(hours) };
    }
    case 'revoke-dm':
      return {
        kind,
        campaignId: campaignOf(flag('campaign')),
        authorizationSource: authorizationSourceOf(flag('authorization-source')),
      };
    case 'revoke-actor': {
      const actorId = flag('actor');
      if (!actorIdSchema.safeParse(actorId).success) {
        throw new AuthOperatorUsageError('--actor must be an actor ID');
      }
      return {
        kind,
        actorId,
        authorizationSource: authorizationSourceOf(flag('authorization-source')),
      };
    }
    case 'sessions':
      return { kind, campaignId: campaignOf(flag('campaign')) };
    case 'reset-password': {
      const login = loginSchema.safeParse(flag('login'));
      if (!login.success) throw new AuthOperatorUsageError('--login must be a login');
      return { kind, login: login.data };
    }
    case 'delete-account': {
      const login = loginSchema.safeParse(flag('login'));
      if (!login.success) throw new AuthOperatorUsageError('--login must be a login');
      return {
        kind,
        login: login.data,
        authorizationSource: authorizationSourceOf(flag('authorization-source')),
      };
    }
  }
}

type OperatorDependencies = Pick<
  SignInDependencies,
  'credentials' | 'clock' | 'publication' | 'accounts'
>;
type Command<K extends AuthOperatorCommand['kind']> = Extract<AuthOperatorCommand, { kind: K }>;

async function campaignOrRefuse(engine: WorldEngine, campaignId: string) {
  const snapshot = await engine.load(campaignId);
  if (!snapshot?.state.campaign) throw new AuthOperatorRefusal('CAMPAIGN_NOT_FOUND');
  return { state: snapshot.state, campaign: snapshot.state.campaign };
}

/** Issues one DM invitation for the campaign's DM; its link is shown once, to the operator. */
export async function issueDmInvitation(
  engine: WorldEngine,
  deps: Pick<SignInDependencies, 'credentials' | 'publicOrigin' | 'clock' | 'publication'>,
  command: Command<'dm-invite'>,
): Promise<IssuedInvitation & { readonly campaignId: string }> {
  const { campaign } = await campaignOrRefuse(engine, command.campaignId);
  const issued = await issueInvitation(deps, {
    campaignId: command.campaignId,
    purpose: 'dm',
    characterId: null,
    actorId: campaign.dmActorId,
    createdBy: 'operator',
    hours: command.expiresHours,
  });
  return { ...issued, campaignId: command.campaignId };
}

export interface RevokedDm {
  readonly campaignId: string;
  readonly actorId: string;
  readonly sessionsRevoked: number;
  readonly invitationsRevoked: number;
  readonly authorizationSource: string;
}

/**
 * Signs the campaign's DM out of it: every session of the DM's actor in this campaign and the
 * campaign's open DM invitations are revoked (a lost device, a leaked link). The DM is back
 * through a new `dm-invite`.
 */
export async function revokeDmSessions(
  engine: WorldEngine,
  deps: OperatorDependencies,
  command: Command<'revoke-dm'>,
): Promise<RevokedDm> {
  const { campaign } = await campaignOrRefuse(engine, command.campaignId);
  const now = iso(deps.clock.now());
  const actorId = campaign.dmActorId;
  const sessionsRevoked = await deps.credentials.revokeActorSessions(
    command.campaignId,
    actorId,
    now,
  );
  const invitationsRevoked = await deps.credentials.revokeActorInvitations(
    actorId,
    command.campaignId,
    now,
  );
  return {
    campaignId: command.campaignId,
    actorId,
    sessionsRevoked,
    invitationsRevoked,
    authorizationSource: command.authorizationSource,
  };
}

export interface RevokedActor {
  readonly actorId: string;
  readonly sessionsRevoked: number;
  readonly invitationsRevoked: number;
  readonly authorizationSource: string;
}

/** "Sign out everywhere": every session of the actor in every campaign, and its open invitations. */
export async function revokeActorEverywhere(
  deps: OperatorDependencies,
  command: Command<'revoke-actor'>,
): Promise<RevokedActor> {
  const now = iso(deps.clock.now());
  const sessionsRevoked = await deps.credentials.revokeSessionsEverywhere(command.actorId, now);
  const invitationsRevoked = await deps.credentials.revokeActorInvitations(
    command.actorId,
    null,
    now,
  );
  return {
    actorId: command.actorId,
    sessionsRevoked,
    invitationsRevoked,
    authorizationSource: command.authorizationSource,
  };
}

/** One live session as the operator sees it: who, where in the campaign, when; never a secret. */
export interface OperatorSessionView {
  readonly sessionId: string;
  readonly actorId: string;
  /** The actor's place in the campaign now: its DM, a player, or none (a seat released). */
  readonly role: 'dm' | 'player' | 'none';
  readonly characterIds: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastSeenAt: string;
}

/** The campaign's live sessions, oldest first. */
export async function listLiveSessions(
  engine: WorldEngine,
  deps: OperatorDependencies,
  command: Command<'sessions'>,
): Promise<{ readonly campaignId: string; readonly sessions: readonly OperatorSessionView[] }> {
  const { state, campaign } = await campaignOrRefuse(engine, command.campaignId);
  const sessions = await deps.credentials.liveSessions(command.campaignId, iso(deps.clock.now()));
  const seats = [...state.roster];
  return {
    campaignId: command.campaignId,
    sessions: sessions.map((session) => {
      const characterIds = seats
        .filter(([, actorId]) => actorId === session.actorId)
        .map(([characterId]) => characterId);
      const role =
        session.actorId === campaign.dmActorId ? 'dm' : characterIds.length > 0 ? 'player' : 'none';
      return {
        sessionId: session.sessionId,
        actorId: session.actorId,
        role,
        characterIds,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
      };
    }),
  };
}

/**
 * Runs one operator command: its one JSON-able result. `publicOrigin` is null unless the
 * configuration is in invitation mode, which only `dm-invite` needs (its link names the origin).
 */
export async function runAuthOperatorCommand(
  engine: WorldEngine,
  deps: OperatorDependencies & { readonly publicOrigin: string | null },
  command: AuthOperatorCommand,
): Promise<object> {
  switch (command.kind) {
    case 'dm-invite':
      if (deps.publicOrigin === null) throw new AuthOperatorRefusal('INVITATIONS_MODE_REQUIRED');
      return issueDmInvitation(engine, { ...deps, publicOrigin: deps.publicOrigin }, command);
    case 'revoke-dm':
      return revokeDmSessions(engine, deps, command);
    case 'revoke-actor':
      return revokeActorEverywhere(deps, command);
    case 'sessions':
      return listLiveSessions(engine, deps, command);
    case 'reset-password': {
      // A single-use reset link for an account (ADR 0041 §7), shown this once to the operator.
      if (deps.publicOrigin === null) throw new AuthOperatorRefusal('INVITATIONS_MODE_REQUIRED');
      const account = await deps.accounts?.findByLogin(command.login);
      if (!deps.accounts || !account) throw new AuthOperatorRefusal('ACCOUNT_NOT_FOUND');
      const reset = await issueReset(
        { accounts: deps.accounts, clock: deps.clock, publicOrigin: deps.publicOrigin },
        account.accountId,
        'operator',
      );
      return { login: account.login, ...reset };
    }
    case 'delete-account': {
      // A person's account forgotten (ADR 0062 §3), a DM's too: the operator then invites the
      // campaign's next DM to the same seat (`dm-invite`), if it goes on.
      const account = await deps.accounts?.findByLogin(command.login);
      if (!deps.accounts || !account) throw new AuthOperatorRefusal('ACCOUNT_NOT_FOUND');
      const seats = await deps.accounts.seats(account.accountId);
      const now = iso(deps.clock.now());
      const accounts = { accounts: deps.accounts, credentials: deps.credentials };
      if (!(await forgetAccount(accounts, account.accountId, now))) {
        throw new AuthOperatorRefusal('ACCOUNT_NOT_FOUND');
      }
      return {
        login: command.login,
        deleted: true,
        authorizationSource: command.authorizationSource,
        seats: seats.map((seat) => ({ campaignId: seat.campaignId, role: seat.role })),
      };
    }
  }
}
