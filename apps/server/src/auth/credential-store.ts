/**
 * Stored credentials of production sign-in (docs/adr/0036-production-sign-in.md; migration
 * 0010_auth.sql): invitations and sessions by the SHA-256 of their tokens, and the evidence of
 * redeem attempts. Never a token. Times are ISO-8601 strings; `now` is always the caller's.
 * Not canonical state: who is a member is the World Engine's roster.
 */
export type InvitationPurpose = 'player' | 'dm';

export interface InvitationRecord {
  readonly invitationId: string;
  readonly tokenHash: string;
  readonly campaignId: string;
  readonly purpose: InvitationPurpose;
  /** The character a player invitation seats; null for the DM's. */
  readonly characterId: string | null;
  /** The DM's actor ID, or `operator` for the operator CLI. */
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /**
   * The actor the invitation signs in: the DM's from the start; a player's `player:<uuid>` once
   * a redeem claimed it (kept, so a retried redeem submits the same assignment).
   */
  readonly actorId: string | null;
  readonly usedAt: string | null;
  readonly revokedAt: string | null;
}

export type NewInvitation = Omit<InvitationRecord, 'usedAt' | 'revokedAt'>;

export interface SessionRecord {
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly campaignId: string;
  readonly actorId: string;
  readonly invitationId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastSeenAt: string;
  readonly revokedAt: string | null;
}

export type NewSession = Omit<SessionRecord, 'lastSeenAt' | 'revokedAt'>;

/** A live session as the operator lists it: never its token or a hash of it. */
export type LiveSession = Omit<SessionRecord, 'tokenHash' | 'revokedAt'>;

export interface RedeemAttempt {
  readonly at: string;
  readonly outcome: 'redeemed' | 'refused' | 'limited';
  /** HMAC of the address under a process-local key. */
  readonly sourceKey: string;
  /** HMAC of the token prefix under the same key; null without a well-formed token. */
  readonly prefixKey: string | null;
}

export type RevokeInvitationOutcome = 'revoked' | 'already-revoked' | 'used' | 'missing';

export interface SessionSummary {
  readonly active: number;
  readonly lastSeenAt: string | null;
}

export interface CredentialStore {
  createInvitation(invitation: NewInvitation): Promise<void>;
  findInvitation(tokenHash: string): Promise<InvitationRecord | null>;
  /** Stores `candidate` as the invitation's actor unless one is stored; answers the stored one. */
  claimActor(invitationId: string, candidate: string): Promise<string>;
  /**
   * In one transaction: marks the invitation used if it is still open at `now` (unused,
   * unrevoked, unexpired), creates the session, and revokes the character's other open
   * invitations (its seat is taken). False, changing nothing, when the invitation is not open.
   */
  completeRedeem(invitationId: string, session: NewSession, now: string): Promise<boolean>;
  /**
   * A new session for an account's seat (ADR 0041 §2): it descends from the invitation the seat
   * came from, which must be used.
   */
  createSession(session: NewSession): Promise<void>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  /** Records use of a session, at most once per granularity (`staleBefore`). */
  touchSession(sessionId: string, now: string, staleBefore: string): Promise<void>;
  /** Revokes one session; whether it was live. */
  revokeSession(tokenHash: string, now: string): Promise<boolean>;
  /** Revokes every unrevoked session of an actor in a campaign; how many. */
  revokeActorSessions(campaignId: string, actorId: string, now: string): Promise<number>;
  /** Revokes every unrevoked session of an actor in every campaign ("sign out everywhere"). */
  revokeSessionsEverywhere(actorId: string, now: string): Promise<number>;
  /**
   * Revokes every open (unused, unrevoked) invitation that signs in this actor, in one campaign
   * or in all (`null`); how many. A DM invitation names its actor from the start.
   */
  revokeActorInvitations(actorId: string, campaignId: string | null, now: string): Promise<number>;
  /** The campaign's live sessions (unrevoked, unexpired at `now`), oldest first. */
  liveSessions(campaignId: string, now: string): Promise<readonly LiveSession[]>;
  /** Revokes every open (unused, unrevoked) invitation for a character; how many. */
  revokeCharacterInvitations(campaignId: string, characterId: string, now: string): Promise<number>;
  revokeInvitation(
    campaignId: string,
    invitationId: string,
    now: string,
  ): Promise<RevokeInvitationOutcome>;
  /** The campaign's invitations, newest first, at most `limit`. */
  listInvitations(campaignId: string, limit: number): Promise<readonly InvitationRecord[]>;
  /** Live sessions (unrevoked, unexpired at `now`) per actor of the campaign. */
  sessionSummaries(
    campaignId: string,
    actorIds: readonly string[],
    now: string,
  ): Promise<ReadonlyMap<string, SessionSummary>>;
  recordAttempt(attempt: RedeemAttempt): Promise<void>;
  /** Deletes attempts and long-dead sessions older than the cutoffs; how many of each. */
  prune(cutoffs: {
    readonly attemptsBefore: string;
    readonly sessionsExpiredBefore: string;
  }): Promise<{ readonly attempts: number; readonly sessions: number }>;
}

const before = (a: string, b: string) => Date.parse(a) < Date.parse(b);
const open = (invitation: InvitationRecord, now: string) =>
  invitation.usedAt === null && invitation.revokedAt === null && before(now, invitation.expiresAt);
const live = (session: SessionRecord, now: string) =>
  session.revokedAt === null && before(now, session.expiresAt);

/** Test support and the reference semantics of the PostgreSQL store. */
export class InMemoryCredentialStore implements CredentialStore {
  readonly #invitations = new Map<string, InvitationRecord>();
  readonly #sessions = new Map<string, SessionRecord>();
  readonly attempts: RedeemAttempt[] = [];

  createInvitation(invitation: NewInvitation): Promise<void> {
    const clash = [...this.#invitations.values()].some(
      (stored) =>
        stored.invitationId === invitation.invitationId ||
        stored.tokenHash === invitation.tokenHash,
    );
    if (clash) return Promise.reject(new Error('invitation already stored'));
    this.#invitations.set(invitation.invitationId, {
      ...invitation,
      usedAt: null,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  findInvitation(tokenHash: string): Promise<InvitationRecord | null> {
    const found = [...this.#invitations.values()].find((stored) => stored.tokenHash === tokenHash);
    return Promise.resolve(found ? { ...found } : null);
  }

  claimActor(invitationId: string, candidate: string): Promise<string> {
    const stored = this.#invitations.get(invitationId);
    if (!stored) return Promise.reject(new Error('unknown invitation'));
    if (stored.actorId !== null) return Promise.resolve(stored.actorId);
    this.#invitations.set(invitationId, { ...stored, actorId: candidate });
    return Promise.resolve(candidate);
  }

  completeRedeem(invitationId: string, session: NewSession, now: string): Promise<boolean> {
    const stored = this.#invitations.get(invitationId);
    if (!stored || !open(stored, now)) return Promise.resolve(false);
    this.#invitations.set(invitationId, { ...stored, usedAt: now });
    this.#sessions.set(session.sessionId, { ...session, lastSeenAt: now, revokedAt: null });
    if (stored.characterId !== null) {
      for (const other of this.#invitations.values()) {
        if (
          other.campaignId === stored.campaignId &&
          other.characterId === stored.characterId &&
          other.usedAt === null &&
          other.revokedAt === null
        ) {
          this.#invitations.set(other.invitationId, { ...other, revokedAt: now });
        }
      }
    }
    return Promise.resolve(true);
  }

  createSession(session: NewSession): Promise<void> {
    const invitation = this.#invitations.get(session.invitationId);
    if (!invitation?.usedAt) return Promise.reject(new Error('a session needs a used invitation'));
    this.#sessions.set(session.sessionId, {
      ...session,
      lastSeenAt: session.createdAt,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  findSession(tokenHash: string): Promise<SessionRecord | null> {
    const found = [...this.#sessions.values()].find((stored) => stored.tokenHash === tokenHash);
    return Promise.resolve(found ? { ...found } : null);
  }

  touchSession(sessionId: string, now: string, staleBefore: string): Promise<void> {
    const stored = this.#sessions.get(sessionId);
    if (stored && before(stored.lastSeenAt, staleBefore)) {
      this.#sessions.set(sessionId, { ...stored, lastSeenAt: now });
    }
    return Promise.resolve();
  }

  revokeSession(tokenHash: string, now: string): Promise<boolean> {
    const stored = [...this.#sessions.values()].find((session) => session.tokenHash === tokenHash);
    if (!stored || stored.revokedAt !== null) return Promise.resolve(false);
    this.#sessions.set(stored.sessionId, { ...stored, revokedAt: now });
    return Promise.resolve(live(stored, now));
  }

  revokeActorSessions(campaignId: string, actorId: string, now: string): Promise<number> {
    let count = 0;
    for (const stored of this.#sessions.values()) {
      if (stored.campaignId === campaignId && stored.actorId === actorId && !stored.revokedAt) {
        this.#sessions.set(stored.sessionId, { ...stored, revokedAt: now });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  revokeSessionsEverywhere(actorId: string, now: string): Promise<number> {
    let count = 0;
    for (const stored of this.#sessions.values()) {
      if (stored.actorId === actorId && !stored.revokedAt) {
        this.#sessions.set(stored.sessionId, { ...stored, revokedAt: now });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  revokeActorInvitations(actorId: string, campaignId: string | null, now: string): Promise<number> {
    let count = 0;
    for (const stored of this.#invitations.values()) {
      if (
        stored.actorId === actorId &&
        (campaignId === null || stored.campaignId === campaignId) &&
        stored.usedAt === null &&
        stored.revokedAt === null
      ) {
        this.#invitations.set(stored.invitationId, { ...stored, revokedAt: now });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  liveSessions(campaignId: string, now: string): Promise<readonly LiveSession[]> {
    return Promise.resolve(
      [...this.#sessions.values()]
        .filter((stored) => stored.campaignId === campaignId && live(stored, now))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map((stored) => ({
          sessionId: stored.sessionId,
          campaignId: stored.campaignId,
          actorId: stored.actorId,
          invitationId: stored.invitationId,
          createdAt: stored.createdAt,
          expiresAt: stored.expiresAt,
          lastSeenAt: stored.lastSeenAt,
        })),
    );
  }

  revokeCharacterInvitations(
    campaignId: string,
    characterId: string,
    now: string,
  ): Promise<number> {
    let count = 0;
    for (const stored of this.#invitations.values()) {
      if (
        stored.campaignId === campaignId &&
        stored.characterId === characterId &&
        stored.usedAt === null &&
        stored.revokedAt === null
      ) {
        this.#invitations.set(stored.invitationId, { ...stored, revokedAt: now });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  revokeInvitation(
    campaignId: string,
    invitationId: string,
    now: string,
  ): Promise<RevokeInvitationOutcome> {
    const stored = this.#invitations.get(invitationId);
    if (!stored || stored.campaignId !== campaignId) return Promise.resolve('missing');
    if (stored.revokedAt !== null) return Promise.resolve('already-revoked');
    if (stored.usedAt !== null) return Promise.resolve('used');
    this.#invitations.set(invitationId, { ...stored, revokedAt: now });
    return Promise.resolve('revoked');
  }

  listInvitations(campaignId: string, limit: number): Promise<readonly InvitationRecord[]> {
    return Promise.resolve(
      [...this.#invitations.values()]
        .filter((stored) => stored.campaignId === campaignId)
        .reverse()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, limit)
        .map((stored) => ({ ...stored })),
    );
  }

  sessionSummaries(
    campaignId: string,
    actorIds: readonly string[],
    now: string,
  ): Promise<ReadonlyMap<string, SessionSummary>> {
    const summaries = new Map<string, SessionSummary>();
    for (const actorId of actorIds) {
      const sessions = [...this.#sessions.values()].filter(
        (stored) =>
          stored.campaignId === campaignId && stored.actorId === actorId && live(stored, now),
      );
      const latest =
        sessions
          .map((stored) => stored.lastSeenAt)
          .sort()
          .at(-1) ?? null;
      summaries.set(actorId, { active: sessions.length, lastSeenAt: latest });
    }
    return Promise.resolve(summaries);
  }

  recordAttempt(attempt: RedeemAttempt): Promise<void> {
    this.attempts.push({ ...attempt });
    return Promise.resolve();
  }

  prune(cutoffs: {
    readonly attemptsBefore: string;
    readonly sessionsExpiredBefore: string;
  }): Promise<{ readonly attempts: number; readonly sessions: number }> {
    const kept = this.attempts.filter((attempt) => !before(attempt.at, cutoffs.attemptsBefore));
    const attempts = this.attempts.length - kept.length;
    this.attempts.splice(0, this.attempts.length, ...kept);
    let sessions = 0;
    for (const stored of [...this.#sessions.values()]) {
      if (before(stored.expiresAt, cutoffs.sessionsExpiredBefore)) {
        this.#sessions.delete(stored.sessionId);
        sessions += 1;
      }
    }
    return Promise.resolve({ attempts, sessions });
  }
}
