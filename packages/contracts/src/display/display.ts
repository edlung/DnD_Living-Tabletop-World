import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { EntityRef } from '../knowledge/views.ts';
import type { Language } from '../language/language.ts';

/**
 * The table display and the table's join link (docs/adr/0042-table-display.md, Stage 610). A
 * display is a device paired to one campaign by a short code the DM types; it reads the PUBLIC and
 * PARTY views and the DM's cast, and writes nothing. The table's link seats accounts in free seats
 * through ordinary single-use invitations.
 */

/** The display's own cookie (`HttpOnly; SameSite=Strict; Path=/api`, `Secure` outside loopback). */
export const DISPLAY_COOKIE = 'ltw_display';
export const DISPLAY_DAYS = 30;
/** How long a pairing code waits for the DM. */
export const PAIRING_MINUTES = 10;
/** Displays one campaign holds at once. */
export const MAX_DISPLAYS = 4;
/** Codes read aloud and typed: no 0/O, 1/I/L. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** A pairing or table code as a person types it: spaces and dashes go, letters are capitals. */
export const shortCodeSchema = z
  .string()
  .max(40)
  .transform((value) => value.replace(/[\s-]/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-HJKMNP-Z2-9]{8}$/));

/** `POST /display/pair`: a pending device and the code it shows. */
export interface DisplayPairingResponse {
  readonly code: string;
  readonly expiresAt: string;
}

/** `GET /display/session`: the device waiting for the DM, or paired. */
export type DisplaySessionResponse =
  | { readonly state: 'pending'; readonly expiresAt: string }
  | {
      readonly state: 'paired';
      readonly campaignId: string;
      readonly campaignName: string;
      readonly language: Language;
      readonly name: string;
    };

export const screenNameSchema = z.string().trim().min(1).max(40);

/** `POST /campaigns/:campaignId/displays` (DM): the code the TV shows, and what to call it. */
export const pairDisplayRequestSchema = z
  .object({ code: shortCodeSchema, name: screenNameSchema.optional() })
  .strict();

export const renameDisplayRequestSchema = z.object({ name: screenNameSchema }).strict();

export interface DisplayView {
  readonly displayId: string;
  readonly name: string;
  readonly pairedAt: string;
  /** When the device last asked anything (coarse: once a minute). */
  readonly lastSeenAt: string | null;
}

/** `GET /campaigns/:campaignId/displays` (DM). */
export interface DisplayListResponse {
  readonly displays: readonly DisplayView[];
  readonly limit: number;
}

/**
 * What the TV shows (§3): a place's scene (null: wherever the party is — the place of the first
 * party character), the battlefield, the table's rolls, a title card, the Chronicle's newest
 * chapter, an approved picture of something the party knows, the join QR code with the last
 * chapter's recap, or nothing. The battlefield keeps the DM's zoom and whom to keep in view (null:
 * whoever's turn it is), so a zoomed board follows the fight.
 */
export const castSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scene'), locationId: entityIdSchema.nullable() }).strict(),
  z
    .object({
      kind: z.literal('battlefield'),
      zoom: z.number().min(0.5).max(2.5).default(1),
      focus: entityIdSchema.nullable().default(null),
    })
    .strict(),
  z.object({ kind: z.literal('dice') }).strict(),
  z
    .object({
      kind: z.literal('title'),
      title: z.string().trim().min(1).max(80),
      subtitle: z.string().trim().max(160).default(''),
    })
    .strict(),
  z.object({ kind: z.literal('chronicle') }).strict(),
  z.object({ kind: z.literal('picture'), entityId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('join') }).strict(),
  z.object({ kind: z.literal('blank') }).strict(),
]);
export type Cast = z.infer<typeof castSchema>;
export type CastKind = Cast['kind'];

export const DEFAULT_CAST: Cast = { kind: 'scene', locationId: null };

/** `GET|POST /campaigns/:campaignId/display/cast` (POST: DM; GET: the DM, displays and players). */
export interface CastResponse {
  readonly cast: Cast;
  readonly revision: number;
  /** A scene cast's place: its own, or where the party is; null for any other cast. */
  readonly place?: string | null;
}

/** `GET /campaigns/:campaignId/display/join` (displays and the DM): the open table link, if any. */
export interface DisplayJoinResponse {
  /** The link and its code while a table link is open and this server holds them. */
  readonly link: string | null;
  readonly code: string | null;
  readonly expiresAt: string | null;
}

/** The table's join link: a few hours, at most a day. */
export const TABLE_LINK_HOURS = 4;
export const MAX_TABLE_LINK_HOURS = 24;

export const createTableLinkRequestSchema = z
  .object({
    hours: z.number().int().min(1).max(MAX_TABLE_LINK_HOURS).default(TABLE_LINK_HOURS),
  })
  .strict();

/** The new link and its code, shown once to the DM (and on the TV while it is open). */
export interface CreatedTableLinkResponse {
  readonly link: string;
  readonly code: string;
  readonly expiresAt: string;
}

/** `GET /campaigns/:campaignId/table-link` (DM): the open link's state and who it seated. */
export interface TableLinkStatusResponse {
  readonly open: boolean;
  readonly expiresAt: string | null;
  readonly seated: readonly {
    readonly character: EntityRef;
    readonly at: string;
    /** Whether the seat's invitation was used (the person took it). */
    readonly taken: boolean;
  }[];
}

/** What a table link or its code names, from its fragment or typed. */
export const tableKeySchema = z.union([
  z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
  z.object({ code: shortCodeSchema }).strict(),
]);
export type TableKey = z.infer<typeof tableKeySchema>;

/** `POST /auth/table/offer`: the campaign and its free seats. */
export interface TableOfferResponse {
  readonly campaignName: string;
  readonly language: Language;
  readonly characters: readonly EntityRef[];
}

/** `POST /auth/table/seat`: a free seat chosen; its single-use invitation's token, once. */
export const tableSeatRequestSchema = z
  .object({ key: tableKeySchema, characterId: entityIdSchema })
  .strict();

export interface TableSeatResponse {
  readonly token: string;
}
