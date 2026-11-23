import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The shell (docs/STAGE_320_DESIGN.md §5.1): one section at a time over the whole stage; a closed
 * section stays mounted but hidden, so a journey opens the one that holds a control before it
 * uses that control. A player reaches sections from the dock, whose last items may wait under More
 * (docs/adr/0043-dm-screen.md §3). The DM's screen is the DM's book (docs/adr/0075-book-interface.md
 * §3): a section is a page of one of seven parts, its tab named as the dock's button was; a part
 * not open keeps its pages' tabs hidden, and `revealDockButton` opens the part first. Names are
 * the campaign's language.
 */
export const dockButton = (page: Page, name: string): Locator =>
  page
    .locator('nav.dock, nav.book-pages')
    .getByRole('button', { name, exact: true, includeHidden: true });

/** The DM's book's part buttons (Книга, Сцена, Герои, Мир, Журнал, За столом, Правила). */
export const bookPart = (page: Page, name: string): Locator =>
  page.locator('nav.book-parts').getByRole('button', { name, exact: true });

/** The dock's More, where items that do not fit wait. */
export const dockMore = (page: Page): Locator => page.locator('#dock-more');

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
    if (part !== null) {
      await page.locator(`nav.book-parts button[data-part="${part}"]`).click();
    } else {
      const more = dockMore(page);
      if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
    }
  }
  await expect(button).toBeVisible();
  return button;
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
 * The dock fits its screen (docs/adr/0043-dm-screen.md §3): it never scrolls sideways, and nothing
 * lies over an item it shows or over its More.
 */
export async function expectDockFits(page: Page): Promise<void> {
  await dockSettled(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
  // A player's dock, or the DM's book: its bookmarks and the open part's tabs.
  const shown = page.locator(
    'nav.dock .dock-items button, #dock-more, nav.book-parts button, nav.book-pages ul:not([hidden]) button',
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
  if (!(await dialog.isVisible())) await (await revealDockButton(page, dock)).click();
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
