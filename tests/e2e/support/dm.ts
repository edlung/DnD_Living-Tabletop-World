import { expect, type Locator, type Page } from '@playwright/test';

/** The DM history in the DM's authoring panel (docs/adr/0033-live-session.md §7). */
export const HISTORY_SUMMARY = 'History and undo (DM)';

export const dmHistory = (page: Page): Locator =>
  page.getByRole('region', { name: 'DM history', exact: true });

/** Opens the history disclosure (once) and waits for its list. */
export async function openHistory(page: Page): Promise<void> {
  if (!(await dmHistory(page).isVisible())) {
    await page.getByText(HISTORY_SUMMARY, { exact: true }).click();
  }
  await expect(dmHistory(page)).toBeVisible();
}

/** One entry of the history, by its heading. */
export const historyEntry = (page: Page, title: string): Locator =>
  dmHistory(page).getByRole('listitem').filter({ hasText: title });
