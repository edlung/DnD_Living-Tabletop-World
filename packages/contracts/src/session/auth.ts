import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Production sign-in (docs/adr/0036-production-sign-in.md; docs/STAGE_340_DESIGN.md): single-use
 * invitations issued by the DM (or, for the DM, by the operator), redeemed for a cookie session
 * bound to one actor in one campaign. A credential never appears in a response after sign-in,
 * in an error, in a URL the server receives, or in a listing.
 */

/** An invitation or session token: 32 random bytes, base64url without padding. */
export const CREDENTIAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Hours an invitation lasts unless the DM says otherwise, and the most it may last. */
export const DEFAULT_INVITATION_HOURS = 72;
export const MAX_INVITATION_HOURS = 168;

/** A session's absolute lifetime. */
export const SESSION_DAYS = 14;

/** The session cookie (`HttpOnly; SameSite=Strict; Path=/api`, `Secure` outside localhost). */
export const SESSION_COOKIE = 'ltw_session';

/** `POST /auth/redeem`: the token from the link's fragment, in a JSON body. */
export const redeemRequestSchema = z
  .object({ token: z.string().regex(CREDENTIAL_TOKEN_PATTERN) })
  .strict();
export type RedeemRequest = z.infer<typeof redeemRequestSchema>;

/** A redeemed invitation: the campaign its session opens. The cookie carries the session. */
export interface RedeemResponse {
  readonly campaignId: string;
}

/** `GET /auth/session`: the campaign of a live session whose actor is still a member, or 401. */
export interface AuthSessionResponse {
  readonly campaignId: string;
}

export const invitationIdSchema = z.uuid();

/** `POST /campaigns/:campaignId/invitations` (DM only): a link for an unassigned character. */
export const createInvitationRequestSchema = z
  .object({
    characterId: entityIdSchema,
    expiresHours: z.number().int().min(1).max(MAX_INVITATION_HOURS).optional(),
  })
  .strict();
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

/** The new invitation, its link shown this once: `<origin>/join#<token>`. */
export interface CreatedInvitationResponse {
  readonly invitationId: string;
  readonly characterId: string;
  readonly expiresAt: string;
  readonly link: string;
}

export const INVITATION_STATUSES = ['pending', 'used', 'revoked', 'expired'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** One invitation as the DM lists it: never its token or a hash of it. */
export interface InvitationView {
  readonly invitationId: string;
  /** `dm` invitations come from the operator CLI; `player` ones name their character. */
  readonly purpose: 'player' | 'dm';
  readonly characterId: string | null;
  readonly status: InvitationStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly revokedAt: string | null;
}

/** A character with a player: never the player's actor ID. */
export interface MemberView {
  readonly characterId: string;
  /** Sessions of its player that are neither expired nor revoked. */
  readonly activeSessions: number;
  /** When one of those sessions was last used (coarse, at most every five minutes). */
  readonly lastSeenAt: string | null;
}

/** `GET /campaigns/:campaignId/invitations` (DM only): newest invitations first, then members. */
export interface MembershipResponse {
  readonly invitations: readonly InvitationView[];
  readonly members: readonly MemberView[];
}

/** `POST …/invitations/:invitationId/revoke` (DM only). */
export interface RevokeInvitationResponse {
  readonly status: 'revoked';
}

/**
 * `POST …/members/:characterId/revoke` (DM only): the player's sessions and the character's
 * open invitations are revoked, then `ReleaseCharacter` frees the character for a new invitation.
 */
export interface RevokeMemberResponse {
  readonly released: boolean;
  readonly sessionsRevoked: number;
  readonly invitationsRevoked: number;
}
