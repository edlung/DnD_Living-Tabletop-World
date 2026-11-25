import type { AccountCampaign, CampaignLibraryEntry } from '@ltw/contracts';

/**
 * How the shelf is put in order (docs/adr/0075-book-interface.md §20): which of the account's
 * books it goes on with, and the library's books by the age they are written for.
 */

/**
 * The book to go on with: the one whose last evening is the latest — by the instant it ended, or
 * began while it still runs (a session left open for a week is not "now"). A book no evening was
 * played in is opened, not gone on with; a campaign played on another server is looked at here,
 * never gone on with.
 */
export function currentOf(played: readonly AccountCampaign[]): string | null {
  let current: { readonly id: string; readonly at: number } | null = null;
  for (const campaign of played) {
    const evening = campaign.evening ?? null;
    if (evening === null || (campaign.away ?? null) !== null) continue;
    const at = Date.parse(evening.at);
    if (Number.isNaN(at)) continue;
    if (current === null || at > current.at) current = { id: campaign.campaignId, at };
  }
  return current?.id ?? null;
}

/** The book gone on with stands first; the others keep their order. */
export function currentFirst(
  played: readonly AccountCampaign[],
  current: string | null,
): readonly AccountCampaign[] {
  if (current === null) return played;
  return [
    ...played.filter((campaign) => campaign.campaignId === current),
    ...played.filter((campaign) => campaign.campaignId !== current),
  ];
}

export interface LibraryShelf {
  /** The age mark its books carry, as written: "8+". */
  readonly audience: string;
  readonly books: readonly CampaignLibraryEntry[];
}

/** The library's books on shelves by age, the youngest first; within a shelf, the library's order. */
export function shelvesOf(campaigns: readonly CampaignLibraryEntry[]): readonly LibraryShelf[] {
  const age = (audience: string) => Number.parseInt(audience, 10) || 0;
  const marks = [...new Set(campaigns.map((campaign) => campaign.audience))].sort(
    (one, other) => age(one) - age(other) || one.localeCompare(other),
  );
  return marks.map((audience) => ({
    audience,
    books: campaigns.filter((campaign) => campaign.audience === audience),
  }));
}

/** How many books of a shelf stand in view before it is unfolded: one row of it. */
export function inView(columns: number): number {
  return Math.max(1, Math.floor(columns));
}
