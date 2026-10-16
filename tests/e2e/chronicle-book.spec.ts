import { expect, test, type Page } from '@playwright/test';

import campaigns from './fixtures/dm-tool-campaigns.json' with { type: 'json' };
import { ADD_TO_THE_WORLD, TOMAS_REQUEST } from './support/authoring.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { dockButton, openChronicle, openSheet } from './support/shell.ts';

/**
 * The Chronicle as a book and a flashback as a scene (docs/STAGE_320_DESIGN.md §5.6–7): the
 * DM writes a chapter from the book's header; the player reads it as two facing pages (one
 * parchment page on a phone) with its sources in the margin, opens a memory's flashback, and
 * comes back by Return or Escape with focus where it was (`accessibility.spec.ts` scans the
 * book and the flashback at the three widths). The campaign is this journey's own.
 */
const campaign = campaigns.book;
const TITLE = 'Chapter I — Shadows on the Trade Road';
const LINE = 'Mira told us the caravan left before dawn.';
const book = (page: Page) => page.getByRole('dialog', { name: 'Chronicle' });
const chapter = (page: Page) => book(page).getByRole('article', { name: TITLE });
const flashback = (page: Page) => book(page).getByRole('region', { name: 'Flashback' });

async function writeChapter(page: Page): Promise<void> {
  await enterWorld(page, TOKENS.dm, campaign);
  await openChronicle(page);
  await expect(book(page)).toContainText('No chapter has been written for this view yet.');
  await book(page).getByText('Write a chapter (DM)', { exact: true }).click();
  await book(page)
    .getByLabel('Told from', { exact: true })
    .selectOption('CHARACTER:elowen-starwhisper');
  await book(page).getByRole('button', { name: 'Write chapter' }).click();
  await expect(
    book(page).getByRole('status').filter({
      hasText: 'Chapter written as the plain record: the narrator was unavailable.',
    }),
  ).toBeVisible();
  // The new chapter opens at once, as the DM reads it.
  await expect(chapter(page)).toBeVisible();
  await expect(book(page).getByRole('button', { name: TITLE })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

test('the player reads a chapter as a book, opens a flashback and returns by keyboard', async ({
  browser,
}) => {
  const dm = await browser.newPage();
  await writeChapter(dm);
  await dm.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await enterWorld(page, TOKENS.player, campaign);
  const opener = dockButton(page, 'Chronicle');
  await opener.click();
  // The left page: title, the place's plate (the honest mist), the prose with margin notes.
  await expect(chapter(page).getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(chapter(page)).toContainText(LINE);
  await expect(chapter(page).locator('.chapter-plate')).toContainText('Market Square');
  await expect(chapter(page).locator('.chapter-plate')).toContainText(
    'No approved picture of this place yet',
  );
  const notes = chapter(page).getByRole('note', { name: 'Sources of this passage' });
  await expect(notes.first()).toContainText('Recorded as: a memory recorded');
  await expect(notes.first()).toContainText('TESTIMONY');
  await expect(chapter(page)).toContainText('Told as the plain record');
  // The right page: key moments, what was learned as typed records, the people met.
  await expect(chapter(page).getByRole('heading', { name: 'Key moments' })).toBeVisible();
  await expect(chapter(page).getByRole('heading', { name: 'What was learned' })).toBeVisible();
  await expect(chapter(page).getByRole('heading', { name: 'People met' })).toBeVisible();
  await expect(chapter(page).locator('.people-met')).toContainText('Mira Vale');

  // A flashback plays over the book and takes focus; Escape goes back to the page.
  const open = chapter(page)
    .getByRole('listitem')
    .filter({ hasText: LINE })
    .getByRole('button', { name: 'Open flashback' });
  await open.click();
  await expect(flashback(page)).toBeFocused();
  await expect(flashback(page)).toContainText('Mira Vale says the caravan left before dawn.');
  await expect(flashback(page)).toContainText('— Mira Vale');
  await expect(flashback(page)).toContainText('Day 1');
  await expect(flashback(page)).toContainText('No approved picture of this place yet');
  await page.keyboard.press('Escape');
  await expect(flashback(page)).toHaveCount(0);
  await expect(book(page)).toBeVisible();
  await expect(open).toBeFocused();
  // Return does the same; then Escape closes the book and focus goes back to the dock.
  await open.click();
  await flashback(page).getByRole('button', { name: 'Return', exact: true }).click();
  await expect(open).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(book(page)).toBeHidden();
  await expect(opener).toBeFocused();

  await context.close();
});

test('under reduced motion nothing moves: the sheet and the waiting ring stay still', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterWorld(page, TOKENS.dm, campaigns.motion);
  // Hold the assistant's answer (a delayed transport) to look at "Creating…".
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/ai/intents', async (route) => {
    await held;
    await route.continue();
  });
  await openSheet(page, ADD_TO_THE_WORLD);
  await page.getByLabel('Describe what to add', { exact: true }).fill(TOMAS_REQUEST);
  await page.getByRole('button', { name: 'Propose', exact: true }).click();
  const creating = page.getByRole('status').filter({ hasText: 'Creating…' });
  await expect(creating).toBeVisible();
  expect(
    await page.locator('#sheet-add').evaluate((sheet) => getComputedStyle(sheet).animationName),
  ).toBe('none');
  expect(
    await creating
      .locator('.creating-ring')
      .evaluate((ring) => getComputedStyle(ring).animationName),
  ).toBe('none');
  release();
  await expect(page.getByRole('region', { name: 'Authoring proposal' })).toBeVisible();
  // The proposal card: what will be added, each with its check; who will see it.
  const card = page.getByRole('region', { name: 'Authoring proposal' });
  await expect(card.getByRole('list', { name: 'Proposed changes' })).toContainText(
    'Create npc Tomas Reed at North Gate',
  );
  await expect(card).toContainText('Until you confirm it, only you see this proposal.');
  await expect(card).toContainText('Tomas Reed alone holds this account');
});
