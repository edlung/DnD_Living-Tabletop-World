import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The book is the screen (docs/adr/0075-book-interface.md §3, §4): the DM's seven parts and a
 * hero's five; a section is a page of one part, its tab named as the dock's button was. A part not
 * open keeps its pages' tabs in the document, hidden, and `revealDockButton` opens the part first.
 * A closed section stays mounted, so a journey opens the one that holds a control before using it.
 * Names are the campaign's language.
 */
export const dockButton = (page: Page, name: string): Locator =>
  page.locator('nav.book-pages').getByRole('button', { name, exact: true, includeHidden: true });

/** The DM's book's part buttons (Книга, Сцена, Герои, Мир, Журнал, За столом, Правила). */
export const bookPart = (page: Page, name: string): Locator =>
  page.locator('nav.book-parts').getByRole('button', { name, exact: true });

/** Two frames: a new width has reached the dock, and the dock has measured itself again. */
export async function dockSettled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** Shows a dock item, opening More when it waits there, and returns it. */
export async function revealDockButton(page: Page, name: string): Promise<Locator> {
  await dockSettled(page);
  const button = dockButton(page, name);
  await expect(button).toBeAttached();
  if (!(await button.isVisible())) {
    const part = await button.getAttribute('data-part');
    await page.locator(`nav.book-parts button[data-part="${part ?? ''}"]`).click();
  }
  await expect(button).toBeVisible();
  return button;
}

/**
 * A phone's head keeps the view, how to play, refresh, the account and leaving behind "More"
 * (docs/adr/0075-book-interface.md §21): opens its list where it is there and closed. On a wider
 * screen there is no "More" and nothing happens.
 */
export async function openTopMenu(page: Page): Promise<void> {
  // The world's own head, once it is there: asked while the world still opens, "More" is not yet.
  await expect(page.locator('header.topbar')).toBeVisible();
  const more = page.locator('header.topbar .topbar-more');
  if ((await more.isVisible()) && (await more.getAttribute('aria-expanded')) !== 'true') {
    await more.click();
  }
}

/** Opens a dock sheet (once) and waits until it shows. */
export async function openSheet(page: Page, name: string): Promise<void> {
  const button = dockButton(page, name);
  if ((await button.getAttribute('aria-expanded')) !== 'true') {
    const shown = await revealDockButton(page, name);
    // Opening the DM's part may have opened this very page: a click would close it again.
    if ((await shown.getAttribute('aria-expanded')) !== 'true') await shown.click();
  }
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const id = await button.getAttribute('aria-controls');
  await expect(page.locator(`#${id ?? ''}`)).toBeVisible();
}

/** Closes a dock sheet if it is open, uncovering the stage. */
export async function closeSheet(page: Page, name: string): Promise<void> {
  const button = dockButton(page, name);
  if ((await button.getAttribute('aria-expanded')) === 'true') {
    await (await revealDockButton(page, name)).click();
  }
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
  await (await revealDockButton(page, name)).click();
  await expect(page.locator('dialog.chronicle-dialog')).toBeVisible();
}

/** The scene region: the world has loaded for this perspective. */
export const sceneRegion = (page: Page, name = 'Scene'): Locator =>
  page.getByRole('region', { name, exact: true });

/**
 * Nothing covers the element: a pointer at its centre reaches it (or something inside it). A
 * result, a prompt or a Retry hidden under a sheet or panel fails here even when "visible".
 */
export async function expectOnTop(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit !== null && element.contains(hit);
      }),
    )
    .toBe(true);
}

/**
 * The book's bookmarks and the open part's tabs fit the screen (docs/adr/0075-book-interface.md
 * §3, §4): the page never scrolls sideways, and nothing lies over a bookmark or a tab it shows.
 */
export async function expectDockFits(page: Page): Promise<void> {
  await dockSettled(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
  // (A phone shows no row of tabs for a part of one page while the stage shows: ADR 0075 §21.)
  const shown = page.locator(
    'nav.book-parts button:visible, nav.book-pages ul:not([hidden]) button:visible',
  );
  for (const button of await shown.all()) {
    await expectOnTop(button);
    // Its words stay inside it: a word wider than its button runs into the next one.
    const spill = await button.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(spill, `the words of ${(await button.textContent()) ?? ''}`).toBeLessThanOrEqual(1);
  }
}

/**
 * Opens the acting character's dialog from the dock (Stage 500) and shows one of its tabs, in the
 * campaign's words; returns the tab's panel.
 */
export async function openCharacter(page: Page, tab: string, dock = 'Character'): Promise<Locator> {
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible())) {
    // The Hero's bookmark opens the sheet itself; its tab, where it shows, does too.
    const opener = dockButton(page, dock);
    if (await opener.isVisible()) await opener.click();
    else
      await page
        .locator(
          `nav.book-parts button[data-part="${(await opener.getAttribute('data-part')) ?? 'hero'}"]`,
        )
        .click();
  }
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: tab, exact: true }).click();
  await expect(dialog.getByRole('tab', { name: tab, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  return dialog.getByRole('tabpanel');
}

/** Closes the character dialog with Escape. */
export async function closeCharacter(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
