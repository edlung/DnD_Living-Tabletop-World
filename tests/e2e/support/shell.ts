import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The shell (docs/STAGE_320_DESIGN.md §5.1): the dock opens one sheet at a time over the lower
 * stage, and a closed sheet stays mounted but hidden, so a journey opens the sheet that holds a
 * control before it uses that control. Names are the dock's words in the campaign's language.
 */
export const dockButton = (page: Page, name: string): Locator =>
  page.locator('nav.dock').getByRole('button', { name, exact: true });

/** Opens a dock sheet (once) and waits until it shows. */
export async function openSheet(page: Page, name: string): Promise<void> {
  const button = dockButton(page, name);
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const id = await button.getAttribute('aria-controls');
  await expect(page.locator(`#${id ?? ''}`)).toBeVisible();
}

/** Closes a dock sheet if it is open, uncovering the lower stage. */
export async function closeSheet(page: Page, name: string): Promise<void> {
  const button = dockButton(page, name);
  if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
}

/** Views another known place: the location choice lives in the Places sheet. */
export async function chooseLocation(
  page: Page,
  placeId: string,
  words: { readonly sheet: string; readonly label: string } = {
    sheet: 'Places',
    label: 'Location',
  },
): Promise<void> {
  await openSheet(page, words.sheet);
  await page.getByLabel(words.label, { exact: true }).selectOption(placeId);
  await closeSheet(page, words.sheet);
}

/** Opens the Chronicle book, a modal dialog over the world. */
export async function openChronicle(page: Page, name = 'Chronicle'): Promise<void> {
  await dockButton(page, name).click();
  await expect(page.locator('dialog.chronicle-dialog')).toBeVisible();
}

/** The scene region: the world has loaded for this perspective. */
export const sceneRegion = (page: Page, name = 'Scene'): Locator =>
  page.getByRole('region', { name, exact: true });
