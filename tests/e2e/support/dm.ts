import { expect, type Locator, type Page } from '@playwright/test';

import { openSheet } from './shell.ts';

/** The DM history, in the History sheet (docs/adr/0033-live-session.md §7). */
export const HISTORY_SUMMARY = 'History and undo (DM)';

export const dmHistory = (page: Page): Locator =>
  page.getByRole('region', { name: 'DM history', exact: true });

/** Opens the History sheet (once) and waits for its list. */
export async function openHistory(page: Page): Promise<void> {
  await openSheet(page, 'History');
  await expect(page.getByText(HISTORY_SUMMARY, { exact: true })).toBeVisible();
  await expect(dmHistory(page)).toBeVisible();
}

/** One entry of the history, by its heading. */
export const historyEntry = (page: Page, title: string): Locator =>
  dmHistory(page).getByRole('listitem').filter({ hasText: title });
