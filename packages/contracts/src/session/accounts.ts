import { z } from 'zod';

import type { Language } from '../language/language.ts';
import { CREDENTIAL_TOKEN_PATTERN } from './auth.ts';
import type { CampaignAway } from './lobby.ts';

/**
 * Accounts (docs/adr/0041-accounts.md, Stage 600): a login and a password that hold a person's seats
 * — for each campaign the actor they are there. Inside a campaign, ADR 0036's campaign session still
 * decides; opening a campaign from the account mints one. Never a password, a hash or a token in a
 * response, an error, a URL or a listing.
 */

/** The account cookie (`HttpOnly; SameSite=Strict; Path=/api`, `Secure` outside localhost). */
export const ACCOUNT_COOKIE = 'ltw_account';
/** An account session's absolute lifetime. */
export const ACCOUNT_SESSION_DAYS = 30;
/** How long a reset link works. */
export const RESET_HOURS = 72;
/** Campaigns an account may create from a ready adventure. */
export const MAX_TEMPLATE_CAMPAIGNS = 10;

/** 3–32 of `a-z 0-9 . _ -`, compared case-insensitively. */
export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/);
export const passwordSchema = z.string().min(10).max(200);
export const displayNameSchema = z.string().trim().min(1).max(60);

/** A new account, made only together with a seat (a redeem or a claim). */
export const newAccountSchema = z
  .object({ login: loginSchema, password: passwordSchema, displayName: displayNameSchema })
  .strict();
export type NewAccount = z.infer<typeof newAccountSchema>;

/** `POST /auth/sign-in`: every failure answers the same 401. */
export const signInRequestSchema = z
  .object({ login: loginSchema, password: z.string().min(1).max(200) })
  .strict();
export type SignInRequest = z.infer<typeof signInRequestSchema>;

/** `POST /auth/claim`: the seat of the browser's live campaign session becomes a new account's. */
export const claimRequestSchema = newAccountSchema;

/** `POST /auth/reset`: a reset link's token (from its fragment) and the new password. */
export const resetRequestSchema = z
  .object({ token: z.string().regex(CREDENTIAL_TOKEN_PATTERN), password: passwordSchema })
  .strict();

/** `POST /account/password`. */
export const changePasswordRequestSchema = z
  .object({ current: z.string().min(1).max(200), next: passwordSchema })
  .strict();

/** `POST /account/name`. */
export const renameRequestSchema = z.object({ displayName: displayNameSchema }).strict();

/** Ready adventures a campaign starts from. */
/** The ready adventures in each language (docs/adr/0058-campaign-content.md §5). */
export const CAMPAIGN_TEMPLATES = [
  'ravenford-en',
  'ravenford-ru',
  'hollowmere-en',
  'hollowmere-ru',
] as const;
export type CampaignTemplate = (typeof CAMPAIGN_TEMPLATES)[number];

/** `POST /account/campaigns`: a new campaign from a ready adventure, the account its DM. */
export const createCampaignRequestSchema = z
  .object({ template: z.enum(CAMPAIGN_TEMPLATES) })
  .strict();

export type SeatRole = 'dm' | 'player';

/** One of the account's campaigns as its hub lists it. */
export interface AccountCampaign {
  readonly campaignId: string;
  readonly name: string;
  readonly role: SeatRole;
  readonly language: Language;
  /** The account's characters there; none for the DM. */
  readonly characters: readonly { readonly entityId: string; readonly name: string }[];
  /** Played on another server since a move; null at home (docs/adr/0061-local-mode.md §5). */
  readonly away: CampaignAway | null;
}

/** `GET /account`: the signed-in account, or 401. */
export interface AccountResponse {
  readonly login: string;
  readonly displayName: string;
  readonly campaigns: readonly AccountCampaign[];
}

/** `POST /account/campaigns/:campaignId/enter` and a created campaign: the campaign session is set. */
export interface EnteredCampaignResponse {
  readonly campaignId: string;
  readonly role: SeatRole;
}

/** A reset link, shown once: `<origin>/reset#<token>`. */
export interface CreatedResetResponse {
  readonly link: string;
  readonly expiresAt: string;
}
