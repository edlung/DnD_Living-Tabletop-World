import { z } from 'zod';

import type { ChatChannel, ChatVoice } from '../chat/chat.ts';
import type { RollGroup, RollSubject } from '../dice/rolls.ts';
import type { Language } from '../language/language.ts';
import { CREDENTIAL_TOKEN_PATTERN } from './auth.ts';
import type { KeepsakeKind } from './ending.ts';
import type { CampaignAway, NextGame } from './lobby.ts';

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

/**
 * `POST /account/library-campaigns`: a new campaign from the campaign library, the account its DM
 * (docs/adr/0058-campaign-content.md, notes of 2026-11-19). The client keeps its request ID and
 * sends it again while the answer is 202 `{ preparing: true }`: the same creation continues.
 */
export const createLibraryCampaignRequestSchema = z
  .object({
    requestId: z.uuid(),
    libraryId: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
    variantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  })
  .strict();
export type CreateLibraryCampaignRequest = z.infer<typeof createLibraryCampaignRequestSchema>;
/** The 202 of `POST /account/library-campaigns` while the campaign is still being prepared. */
export const libraryCampaignPreparingSchema = z.object({ preparing: z.literal(true) }).strict();

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
  /** When its table meets again; null when no date is set or it has passed (ADR 0071 §3). */
  readonly nextGame: NextGame | null;
  /**
   * How many chapters the party's story holds: above none, its book has something to read
   * (docs/adr/0072-keepsakes.md §1). A count, nothing of what they tell.
   */
  readonly chapters: number;
  /**
   * Where the party is, by the name the party knows it by: the place its first placed character
   * stands in, else the running scene's (docs/adr/0075-book-interface.md §10). Null when the party
   * stands nowhere it knows, and on a server from before the shelf.
   */
  readonly place?: string | null;
  /**
   * The last evening played: the real instant it ended — or began, while it still runs. The shelf
   * goes on with the book played last (docs/adr/0075-book-interface.md §20). Null before the
   * first evening, and absent on a server from before the shelf told of evenings.
   */
  readonly evening?: { readonly at: string; readonly running: boolean } | null;
  /**
   * The adventure is over (docs/adr/0072-keepsakes.md §2): when its DM finished it, the days it
   * was played, its heroes and what each keeps, as the whole table reads them. Null while it is
   * played.
   */
  readonly finished: FinishedCampaign | null;
}

export interface FinishedCampaign {
  readonly finishedAt: string;
  /** The first and the last real day played; null when no evening was. */
  readonly played: { readonly from: string; readonly to: string } | null;
  readonly heroes: readonly string[];
  readonly keepsakes: readonly {
    readonly hero: string;
    readonly kind: KeepsakeKind;
    readonly label: string;
    readonly line: string;
  }[];
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

/**
 * `POST /account/delete` (docs/adr/0062-account-privacy.md §3): the current password and the login
 * typed again, so a session left open is not enough.
 */
export const deleteAccountRequestSchema = z
  .object({ password: z.string().min(1).max(200), login: z.string().min(1).max(64) })
  .strict();
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

/** A chat message one wrote, in a copy of one's data. */
export interface AccountChatLine {
  readonly at: string;
  readonly channel: ChatChannel;
  readonly voice: ChatVoice;
  /** The character it was said as; null for the DM. */
  readonly speaker: string | null;
  readonly text: string;
}

/** A star and a wish one wrote at an evening's end, in a copy of one's data (ADR 0071 §2). */
export interface AccountReflectionLine {
  readonly at: string;
  /** The session's title. */
  readonly session: string;
  /** The character it was written as; null for the DM. */
  readonly author: string | null;
  readonly star: string;
  readonly wish: string;
}

/** What one's hero keeps from a finished adventure, in a copy of one's data (ADR 0072 §2). */
export interface AccountKeepsakeLine {
  readonly at: string;
  readonly hero: string;
  readonly label: string;
  readonly line: string;
}

/** One's hero's backstory, in a copy of one's data (ADR 0073 §5). */
export interface AccountBackstoryLine {
  readonly at: string;
  readonly hero: string;
  readonly body: string;
}

/** A private note one wrote, in a copy of one's data (ADR 0073 §5). */
export interface AccountNoteLine {
  readonly at: string;
  /** The character it was written as. */
  readonly hero: string;
  readonly title: string;
  readonly body: string;
}

/** A roll one made, in a copy of one's data. */
export interface AccountRollLine {
  readonly at: string;
  /** The character who rolled; null for the DM. */
  readonly roller: string | null;
  readonly subject: RollSubject;
  readonly groups: readonly RollGroup[];
}

/** One campaign in a copy of one's data: what the account wrote and rolled there. */
export interface AccountCampaignData {
  readonly campaignId: string;
  readonly name: string;
  readonly role: SeatRole;
  readonly language: Language;
  readonly characters: readonly { readonly entityId: string; readonly name: string }[];
  readonly chat: readonly AccountChatLine[];
  readonly rolls: readonly AccountRollLine[];
  readonly reflections: readonly AccountReflectionLine[];
  readonly keepsakes: readonly AccountKeepsakeLine[];
  /** A player's own heroes' backstories; none for a DM (ADR 0073 §5). */
  readonly backstories: readonly AccountBackstoryLine[];
  /** The private notes the account's own seat wrote here. */
  readonly notes: readonly AccountNoteLine[];
  /** A DM's last words to the table at a campaign's end; null for a player, or when none. */
  readonly closingLine: string | null;
}

/**
 * `GET /account/data` (docs/adr/0062-account-privacy.md §2): a person's data as one file. Never a
 * password hash, a token, another person's message or what the person's characters do not know.
 */
export interface AccountDataResponse {
  readonly exportedAt: string;
  readonly account: {
    readonly login: string;
    readonly displayName: string;
    readonly createdAt: string;
    readonly passwordChangedAt: string;
  };
  readonly sessions: readonly {
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly revokedAt: string | null;
  }[];
  readonly campaigns: readonly AccountCampaignData[];
}
