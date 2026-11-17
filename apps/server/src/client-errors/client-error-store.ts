import { createHash } from 'node:crypto';

import {
  CLIENT_ERROR_DAYS,
  MAX_CLIENT_ERRORS,
  type ClientErrorReport,
  type ClientErrorRole,
} from '@ltw/contracts';

/**
 * Client error reports (docs/adr/0073-table-ideas.md §1; migration 0044): one record for each
 * distinct report of a campaign, or of none, counted when it is seen again. Operations data: the
 * World Engine never sees it. The in-memory store is the reference semantics for the PostgreSQL
 * one.
 */
export interface ClientErrorRecord extends Omit<ClientErrorReport, 'campaignId'> {
  /** The campaign whose member's screen it was; null when the sender is no member of one. */
  readonly campaignId: string | null;
  readonly fingerprint: string;
  readonly role: ClientErrorRole | 'nobody';
  readonly build: string;
  readonly count: number;
  readonly firstAt: string;
  readonly lastAt: string;
}

export type NewClientError = Omit<
  ClientErrorRecord,
  'fingerprint' | 'count' | 'firstAt' | 'lastAt'
>;

export interface ClientErrorStore {
  /** Counts the report, removes what is older than the days kept, and holds the list to its size. */
  record(report: NewClientError, at: string): Promise<void>;
  /** A campaign's reports, the latest seen first. */
  ofCampaign(campaignId: string): Promise<readonly ClientErrorRecord[]>;
  /** Takes a campaign's reports away. */
  clear(campaignId: string): Promise<void>;
}

/** Reports of no campaign the server holds at most: the operator's list. */
export const MAX_UNPLACED_CLIENT_ERRORS = 500;

/** What tells one report from another: every field but the build and the times. */
export function fingerprintOf(report: NewClientError): string {
  const place = report.place.map(
    (frame) => `${frame.file}:${String(frame.line)}:${String(frame.column)}`,
  );
  const parts = [
    report.role,
    report.kind,
    report.name,
    report.page,
    report.part,
    report.browser,
    String(report.browserVersion),
    report.system,
    report.shell,
    ...place,
  ];
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

/** The instant before which a report is no longer kept. */
export const keptSince = (at: string): string =>
  new Date(Date.parse(at) - CLIENT_ERROR_DAYS * 24 * 60 * 60 * 1000).toISOString();

export const listLimit = (campaignId: string | null): number =>
  campaignId === null ? MAX_UNPLACED_CLIENT_ERRORS : MAX_CLIENT_ERRORS;

export class InMemoryClientErrorStore implements ClientErrorStore {
  readonly #records = new Map<string, ClientErrorRecord>();

  record(report: NewClientError, at: string): Promise<void> {
    const fingerprint = fingerprintOf(report);
    const key = `${report.campaignId ?? ''}\n${fingerprint}`;
    const known = this.#records.get(key);
    this.#records.set(key, {
      ...report,
      place: report.place.map((frame) => ({ ...frame })),
      fingerprint,
      count: (known?.count ?? 0) + 1,
      firstAt: known?.firstAt ?? at,
      lastAt: at,
    });
    const since = keptSince(at);
    for (const [id, record] of this.#records) {
      if (record.lastAt < since) this.#records.delete(id);
    }
    const mine = [...this.#records]
      .filter(([, record]) => record.campaignId === report.campaignId)
      .sort(([, a], [, b]) => b.lastAt.localeCompare(a.lastAt));
    for (const [id] of mine.slice(listLimit(report.campaignId))) this.#records.delete(id);
    return Promise.resolve();
  }

  ofCampaign(campaignId: string): Promise<readonly ClientErrorRecord[]> {
    return Promise.resolve(
      [...this.#records.values()]
        .filter((record) => record.campaignId === campaignId)
        .sort(
          (a, b) => b.lastAt.localeCompare(a.lastAt) || a.fingerprint.localeCompare(b.fingerprint),
        ),
    );
  }

  /** Every record held, for tests of what a report without a campaign leaves. */
  all(): readonly ClientErrorRecord[] {
    return [...this.#records.values()];
  }

  clear(campaignId: string): Promise<void> {
    for (const [id, record] of this.#records) {
      if (record.campaignId === campaignId) this.#records.delete(id);
    }
    return Promise.resolve();
  }
}
