import type { ClientErrorView } from '@ltw/contracts';

/**
 * What the DM has looked at of this table's error reports (docs/adr/0073-table-ideas.md §1): the
 * time of the newest one, kept in this browser, so the notice over the stage comes back only for
 * something new. A time and nothing else; a browser that refuses storage simply asks again.
 */
const key = (campaignId: string) => `ltw.troubles-seen:${campaignId}`;

/** When the newest report was last seen; null for none. */
export const newestAt = (errors: readonly Pick<ClientErrorView, 'lastAt'>[]): string | null =>
  errors.reduce<string | null>(
    (newest, error) => (newest === null || error.lastAt > newest ? error.lastAt : newest),
    null,
  );

export function readSeen(campaignId: string): string | null {
  try {
    const value = localStorage.getItem(key(campaignId));
    return value !== null && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function writeSeen(campaignId: string, at: string | null): void {
  try {
    if (at === null) localStorage.removeItem(key(campaignId));
    else localStorage.setItem(key(campaignId), at);
  } catch {
    // Storage refused: the notice simply comes back.
  }
}
