import { z } from 'zod';

import { campaignIdSchema } from '../kernel/identifiers.ts';

/**
 * Client error reports (docs/adr/0073-table-ideas.md §1): what a broken page tells the family's own
 * server. Every field is an enumeration, a number or one strict pattern; there is no message, no
 * address, no name and nothing of the world. Operations data beside the world, never canonical.
 */

/** How the error surfaced: while drawing, as an uncaught error, as an unhandled rejection. */
export const CLIENT_ERROR_KINDS = ['render', 'error', 'rejection'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

/** The classes a report may name; any other class is `Other`. */
export const CLIENT_ERROR_NAMES = [
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'EvalError',
  'URIError',
  'AggregateError',
  'InternalError',
  'NotAllowedError',
  'NotFoundError',
  'NotSupportedError',
  'InvalidStateError',
  'SecurityError',
  'QuotaExceededError',
  'NetworkError',
  'DataCloneError',
  'DataError',
  'InvalidAccessError',
  'OperationError',
  'EncodingError',
  'NotReadableError',
  'HierarchyRequestError',
  'InvalidCharacterError',
  'IndexSizeError',
  'ZodError',
  'Other',
] as const;
export type ClientErrorName = (typeof CLIENT_ERROR_NAMES)[number];

/** The page that broke. */
export const CLIENT_PAGES = [
  'game',
  'campaigns',
  'sign-in',
  'display',
  'workshop',
  'privacy',
] as const;
export type ClientPage = (typeof CLIENT_PAGES)[number];

/** In the game, what was open: a sheet of the dock, the Chronicle, a hero's sheet. */
export const CLIENT_PARTS = [
  'none',
  'places',
  'journal',
  'dice',
  'add',
  'encounter',
  'time',
  'history',
  'images',
  'players',
  'screen',
  'party',
  'notes',
  'session',
  'chat',
  'shared',
  'rules',
  'chronicle',
  'hero',
  // The DM's book (docs/adr/0074-dm-book.md §3).
  'book',
  // The heroes' appendix and the table's settings (docs/adr/0075-book-interface.md §18).
  'appendix',
  'settings',
] as const;
export type ClientPart = (typeof CLIENT_PARTS)[number];

export const CLIENT_BROWSERS = [
  'chrome',
  'safari',
  'firefox',
  'edge',
  'samsung',
  'opera',
  'other',
] as const;
export type ClientBrowser = (typeof CLIENT_BROWSERS)[number];

export const CLIENT_SYSTEMS = [
  'ios',
  'android',
  'windows',
  'macos',
  'linux',
  'chromeos',
  'other',
] as const;
export type ClientSystem = (typeof CLIENT_SYSTEMS)[number];

/** The native shell around the page (docs/adr/0070-native-apps.md), if any. */
export const CLIENT_SHELLS = ['none', 'player', 'dm', 'tv'] as const;
export type ClientShell = (typeof CLIENT_SHELLS)[number];

/** Frames of the application's own code a report carries at most. */
export const CLIENT_ERROR_FRAMES = 3;

/** A script of the application: a file name (no folder, no address) and where in it. */
export const clientErrorFrameSchema = z
  .object({
    file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}\.(?:js|mjs|ts|tsx)$/),
    line: z.number().int().min(0).max(9_999_999),
    column: z.number().int().min(0).max(9_999_999),
  })
  .strict();
export type ClientErrorFrame = z.infer<typeof clientErrorFrameSchema>;

/** `POST /client-errors`: one report. A campaign is believed only for a member of it. */
export const clientErrorReportSchema = z
  .object({
    kind: z.enum(CLIENT_ERROR_KINDS),
    name: z.enum(CLIENT_ERROR_NAMES),
    page: z.enum(CLIENT_PAGES),
    part: z.enum(CLIENT_PARTS),
    browser: z.enum(CLIENT_BROWSERS),
    browserVersion: z.number().int().min(0).max(9999),
    system: z.enum(CLIENT_SYSTEMS),
    shell: z.enum(CLIENT_SHELLS),
    place: z.array(clientErrorFrameSchema).max(CLIENT_ERROR_FRAMES),
    campaignId: campaignIdSchema.optional(),
  })
  .strict();
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

/** Whose screen it was, as the server knows the sender in that campaign. */
export const CLIENT_ERROR_ROLES = ['player', 'dm', 'display'] as const;
export type ClientErrorRole = (typeof CLIENT_ERROR_ROLES)[number];

/** Distinct reports a campaign's list holds at most; the longest unseen give way. */
export const MAX_CLIENT_ERRORS = 100;
/** Days a report is kept after it was last seen. */
export const CLIENT_ERROR_DAYS = 30;

/** One distinct report of a campaign, as its DM reads it. */
export interface ClientErrorView extends Omit<ClientErrorReport, 'campaignId'> {
  /** Stable for the list: the same report seen again is the same entry. */
  readonly errorId: string;
  readonly role: ClientErrorRole;
  /** The server's build when it was last seen. */
  readonly build: string;
  readonly count: number;
  readonly firstAt: string;
  readonly lastAt: string;
}

/** `GET /campaigns/:campaignId/client-errors`: the DM's list, the latest first. */
export interface ClientErrorsResponse {
  readonly errors: readonly ClientErrorView[];
}
