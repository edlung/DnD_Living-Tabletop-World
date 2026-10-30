import { randomUUID } from 'node:crypto';

import { SESSION_DAYS } from '@ltw/contracts';
import type { Actor, WorldEngine } from '@ltw/domain';

import type { CredentialStore, InvitationPurpose, InvitationRecord } from './credential-store.ts';
import type { RequestLimits } from './limits.ts';
import { iso, type AuthClock } from './session-authenticator.ts';
import { hashToken, newToken } from './tokens.ts';
import type { CampaignPublication } from '../campaigns/publication.ts';

/**
 * Invitations and their redemption (docs/adr/0036-production-sign-in.md §1–2;
 * docs/STAGE_340_DESIGN.md "Flows"). Membership changes only through the World Engine: a
 * player's seat is `AssignCharacter` by the sign-in system actor under the command ID
 * `invite:<invitationId>`, so a retried redeem converges on the same command.
 */
export interface SignInDependencies {
  readonly publication?: CampaignPublication;
  readonly credentials: CredentialStore;
  /** `PUBLIC_ORIGIN`: invitation links, the cookie's `Secure` flag, the origin check. */
  readonly publicOrigin: string;
  readonly clock: AuthClock;
  readonly limits: RequestLimits;
  /** Keys of the attempts evidence: an HMAC under a key that lives in this process only. */
  readonly evidence: (value: string) => string;
}

/** The system actor that seats invited players; never an HTTP caller. */
export const SIGN_IN_ACTOR: Actor = Object.freeze({ actorId: 'sign-in', kind: 'system' });

export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60_000;
export const HOUR_MS = 60 * 60_000;

export const inviteCommandId = (invitationId: string): string => `invite:${invitationId}`;

export interface IssuedInvitation {
  readonly invitationId: string;
  readonly expiresAt: string;
  /** `<origin>/join#<token>`: the token rides in the fragment, which no server ever receives. */
  readonly link: string;
}

/** Stores a new invitation (by its token's hash) and returns its link, shown once. */
export async function issueInvitation(
  deps: Pick<SignInDependencies, 'credentials' | 'publicOrigin' | 'clock' | 'publication'>,
  input: {
    readonly campaignId: string;
    readonly purpose: InvitationPurpose;
    readonly characterId: string | null;
    /** The DM's actor for a DM invitation (fixed from the start); null for a player's. */
    readonly actorId: string | null;
    readonly createdBy: string;
    readonly hours: number;
  },
): Promise<IssuedInvitation> {
  if ((await deps.publication?.state(input.campaignId)) === 'UNPUBLISHED')
    throw new Error('CAMPAIGN_UNPUBLISHED');
  const token = newToken();
  const now = deps.clock.now();
  const invitation = {
    invitationId: randomUUID(),
    tokenHash: hashToken(token),
    campaignId: input.campaignId,
    purpose: input.purpose,
    characterId: input.characterId,
    createdBy: input.createdBy,
    createdAt: iso(now),
    expiresAt: iso(now + input.hours * HOUR_MS),
    actorId: input.actorId,
  };
  await deps.credentials.createInvitation(invitation);
  return {
    invitationId: invitation.invitationId,
    expiresAt: invitation.expiresAt,
    link: `${deps.publicOrigin}/join#${token}`,
  };
}

/** Why a redeem failed: for logs only. Every failure answers the caller the same. */
export type RefusalReason =
  'unknown' | 'used' | 'revoked' | 'expired' | 'campaign' | 'seat' | 'raced';

export type RedeemOutcome =
  | {
      readonly kind: 'redeemed';
      readonly campaignId: string;
      readonly purpose: InvitationPurpose;
      readonly sessionToken: string;
      readonly invitationId: string;
    }
  | { readonly kind: 'refused'; readonly reason: RefusalReason };

const refused = (reason: RefusalReason): RedeemOutcome => ({ kind: 'refused', reason });

/**
 * Redeems an invitation token: it must be known, unused, unrevoked and unexpired; a player's
 * seat is taken through the World Engine, and the invitation is used and the session created
 * in one transaction. The session token is returned once, for the cookie.
 */
export async function redeemInvitation(
  engine: WorldEngine,
  deps: Pick<SignInDependencies, 'credentials' | 'clock'>,
  token: string,
): Promise<RedeemOutcome> {
  const invitation = await deps.credentials.findInvitation(hashToken(token));
  if (!invitation) return refused('unknown');
  if (invitation.revokedAt !== null) return refused('revoked');
  if (invitation.usedAt !== null) return refused('used');
  if (Date.parse(invitation.expiresAt) <= deps.clock.now()) return refused('expired');
  const { campaignId, invitationId } = invitation;
  const campaign = (await engine.load(campaignId))?.state.campaign ?? null;
  if (campaign === null) return refused('campaign');

  let actorId: string;
  if (invitation.purpose === 'dm') {
    actorId = invitation.actorId ?? campaign.dmActorId;
    if (actorId !== campaign.dmActorId) return refused('seat');
  } else {
    const characterId = invitation.characterId;
    if (characterId === null) return refused('seat');
    // The actor is stored before the command, so a retry submits the very same assignment.
    actorId = await deps.credentials.claimActor(invitationId, `player:${randomUUID()}`);
    const result = await engine.execute({
      commandId: inviteCommandId(invitationId),
      campaignId,
      actor: SIGN_IN_ACTOR,
      command: { type: 'AssignCharacter', characterId, playerActorId: actorId },
    });
    if (result.status === 'rejected') return refused('seat');
    // An assignment undone since a first attempt seats nobody.
    const seated = (await engine.load(campaignId))?.state.roster.get(characterId);
    if (seated !== actorId) return refused('seat');
  }

  const sessionToken = newToken();
  const now = deps.clock.now();
  const completed = await deps.credentials.completeRedeem(
    invitationId,
    {
      sessionId: randomUUID(),
      tokenHash: hashToken(sessionToken),
      campaignId,
      actorId,
      invitationId,
      createdAt: iso(now),
      expiresAt: iso(now + SESSION_MS),
    },
    iso(now),
  );
  if (!completed) {
    // The invitation stopped being open while its seat was taken (revoked or expired meanwhile).
    if (invitation.purpose === 'player') await giveSeatBack(engine, deps, invitation);
    return refused('raced');
  }
  return { kind: 'redeemed', campaignId, purpose: invitation.purpose, sessionToken, invitationId };
}

/**
 * Fails closed: undoes this invitation's assignment, through the World Engine, unless another
 * redeem of the same invitation completed (then the seat is that one's). A refused undo leaves
 * a seat without a session, which the DM's member revocation frees.
 */
async function giveSeatBack(
  engine: WorldEngine,
  deps: Pick<SignInDependencies, 'credentials'>,
  invitation: InvitationRecord,
): Promise<void> {
  const current = await deps.credentials.findInvitation(invitation.tokenHash);
  if (current === null || current.usedAt !== null) return;
  await engine.execute({
    commandId: `${inviteCommandId(invitation.invitationId)}:undo`,
    campaignId: invitation.campaignId,
    actor: SIGN_IN_ACTOR,
    command: { type: 'UndoCommand', targetCommandId: inviteCommandId(invitation.invitationId) },
  });
}
