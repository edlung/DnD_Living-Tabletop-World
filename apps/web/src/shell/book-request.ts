import { useEffect } from 'react';

/**
 * "The book" pressed on a campaign's card in the account's list (docs/adr/0072-keepsakes.md §1):
 * the campaign opens with its book shown. Kept for this tab until the campaign's screen takes it;
 * where the browser keeps nothing, the campaign opens as usual.
 */
const KEY = 'ltw:open-book';

export function askForBook(campaignId: string): void {
  try {
    sessionStorage.setItem(KEY, campaignId);
  } catch {
    // Storage refused: the campaign opens without its book shown.
  }
}

/** Whether the book was asked for in this campaign; the asking is spent either way. */
export function takeBookRequest(campaignId: string): boolean {
  try {
    const asked = sessionStorage.getItem(KEY);
    if (asked !== null) sessionStorage.removeItem(KEY);
    return asked === campaignId;
  } catch {
    return false;
  }
}

/** The campaign's screen: opens the book once when it was asked for from the account's list. */
export function useBookRequest(campaignId: string, openBook: () => void): void {
  useEffect(() => {
    if (takeBookRequest(campaignId)) openBook();
  }, []);
}
