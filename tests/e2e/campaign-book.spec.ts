import { expect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openChronicle, openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The book of the campaign (docs/adr/0072-keepsakes.md §1, Stage 770): the DM closes an evening
 * with its chapter, a star and a wish are written, a letter is shown to the party; "The whole
 * book" in the Chronicle is then the party's story on one page — the cover, the chapter with its
 * evening's day and its stars, what was shown to the party — for the DM and for a player alike,
 * with no chapter told from anyone else and no wish; and it prints: the page laid out for paper
 * alone, saved as a PDF on A4 and on Letter. Chromium on a laptop and WebKit on an iPad, each on
 * a campaign of its own (WebKit saves no PDF: there the paper is read as the print media show it).
 */
const campaignOf = () =>
  test.info().project.name === 'ipad' ? UI_PARTY_CAMPAIGNS.bookIpad : UI_PARTY_CAMPAIGNS.book;

const FIRST = 'Session 1: Arrival in Ravenford';
const LINE = 'We swore to find the missing caravan.';
const DIARY = 'Elowen’s own diary';
const STAR = 'The chase over the roofs!';
const WISH = 'I wish the fights were shorter.';
const BRANN_STAR = 'Brann held the bridge alone.';
const BRANN_WISH = 'More riddles, please.';
const LETTER = 'A letter, unsigned';
const LETTER_TEXT = 'Meet me at the mill after dark.';
const WAIT = { timeout: 20_000 };

declare global {
  interface Window {
    printed?: number;
  }
}

/** The browser's print is counted, not opened: the page laid out for paper stays to be read. */
async function countPrints(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.print = () => {
      window.printed = (window.printed ?? 0) + 1;
    };
  });
}

/** How many pages a PDF holds, by its page objects. */
const pagesOf = (pdf: Buffer): number =>
  (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;

async function openWholeBook(page: Page) {
  await openChronicle(page);
  const dialog = page.locator('dialog.chronicle-dialog');
  await dialog.getByRole('button', { name: 'The whole book', exact: true }).click();
  const book = dialog.getByRole('region', { name: 'The book of the campaign' });
  await expect(book.getByRole('heading', { level: 4, name: FIRST })).toBeVisible(WAIT);
  return { dialog, book };
}

test('the party’s story is one book, for the DM and a player, and it prints', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await countPrints(dm);
  // Everything the player's browser reads for the book as the party.
  const asParty: Promise<string>[] = [];
  player.on('response', (response) => {
    if (new URL(response.url()).searchParams.get('perspective') === 'PARTY') {
      asParty.push(response.text().catch(() => ''));
    }
  });
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);

  // A letter for the whole party, and a chapter told from one character: the book holds the
  // first and never the second.
  await openSheet(dm, 'Party');
  const give = dm.locator('#sheet-party').getByRole('region', { name: 'Give a handout' });
  await give.getByLabel('Title', { exact: true }).fill(LETTER);
  await give.getByLabel('Text (optional)', { exact: true }).fill(LETTER_TEXT);
  await give.getByRole('button', { name: 'Give the handout' }).click();
  await expect(give.getByRole('status')).toHaveText('Given.', WAIT);
  await openChronicle(dm);
  const chronicle = dm.locator('dialog.chronicle-dialog');
  await chronicle.getByText('Write a chapter (DM)', { exact: true }).click();
  await chronicle.getByLabel('Title', { exact: true }).fill(DIARY);
  await chronicle
    .getByLabel('Told from', { exact: true })
    .selectOption({ label: 'Elowen Starwhisper' });
  await chronicle.getByRole('button', { name: 'Write chapter', exact: true }).click();
  await expect(chronicle.getByRole('button', { name: DIARY })).toBeVisible(WAIT);
  await chronicle.getByRole('button', { name: 'Close the Chronicle', exact: true }).click();

  // The evening closes with its chapter; a star and a wish from the player, and for Brann.
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await sheet
    .getByRole('group', { name: 'The evening’s moments' })
    .getByLabel('What mattered most tonight, in your own words (optional)', { exact: true })
    .fill(LINE);
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(sheet.locator('.session-ended')).toContainText(
    /Chapter written( as the plain record: [^.]+)?\./,
    WAIT,
  );
  const card = player.getByRole('region', { name: 'Stars and wishes' });
  await card.getByRole('button', { name: 'Write mine', exact: true }).click(WAIT);
  await card.getByLabel('A star: what did you like best?', { exact: true }).fill(STAR);
  await card.getByLabel('A wish: what do you want next time?', { exact: true }).fill(WISH);
  await card.getByRole('button', { name: 'Keep them', exact: true }).click();
  const after = sheet.getByRole('region', { name: 'Stars and wishes' });
  await after.getByText('Write a star and a wish for someone', { exact: true }).click();
  await after.getByLabel('Whose words', { exact: true }).selectOption({ label: 'Brann Ironvale' });
  await after.getByLabel('Star (everyone reads it)', { exact: true }).fill(BRANN_STAR);
  await after.getByLabel('Wish (only you read it)', { exact: true }).fill(BRANN_WISH);
  await after.getByRole('button', { name: 'Keep them', exact: true }).click();
  await expect(
    after.getByRole('status').filter({ hasText: 'Kept for Brann Ironvale.' }),
  ).toBeVisible(WAIT);

  // The DM's whole book: the cover, the chapter with its day and its stars, the letter — the
  // party's story, with neither the chapter told from Elowen nor a wish.
  const { dialog, book } = await openWholeBook(dm);
  await expect(dialog.getByRole('button', { name: 'The whole book', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(book.getByRole('heading', { level: 3 })).not.toBeEmpty();
  await expect(book.getByRole('list', { name: 'The heroes' })).toContainText('Elowen Starwhisper');
  await expect(book.locator('.keepsake-played')).toContainText(/^Played on .*\d{4}/);
  const chapter = book.getByRole('region', { name: FIRST });
  await expect(chapter.locator('.keepsake-day')).toContainText(/\d{4}/);
  await expect(chapter).toContainText(LINE);
  const stars = chapter.getByRole('list', { name: 'What we loved that evening' });
  await expect(stars).toContainText(STAR, WAIT);
  await expect(stars).toContainText(BRANN_STAR);
  await expect(stars).toContainText('Brann Ironvale');
  const shown = book.getByRole('region', { name: 'Gallery' });
  await expect(shown.getByRole('heading', { name: 'Shown to the party' })).toBeVisible();
  await expect(shown).toContainText(LETTER);
  await expect(shown).toContainText(LETTER_TEXT);
  await expect(book).toContainText('To be continued…');
  for (const never of [DIARY, WISH, BRANN_WISH]) await expect(book).not.toContainText(never);
  // The DM's writer belongs to the chapters, not to the book.
  await expect(dialog.getByText('Write a chapter (DM)', { exact: true })).toHaveCount(0);
  await expectAccessible(dm, 'the whole book in the Chronicle');
  // The page scrolls under the keyboard too.
  await book.focus();
  await expect(book).toBeFocused();

  // On paper: the page beside the application, alone in print, every picture read first.
  await dialog.getByRole('button', { name: 'Print or save as PDF', exact: true }).click();
  await expect.poll(() => dm.evaluate(() => window.printed ?? 0), WAIT).toBe(1);
  const paper = dm.locator('body > .print-book');
  await expect(paper).toBeHidden();
  await dm.emulateMedia({ media: 'print' });
  await expect(paper.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(paper.getByRole('heading', { level: 2, name: FIRST })).toBeVisible();
  await expect(paper).toContainText(LINE);
  await expect(paper).toContainText(STAR);
  await expect(paper).toContainText(LETTER_TEXT);
  for (const never of [DIARY, WISH, BRANN_WISH]) await expect(paper).not.toContainText(never);
  await expect(dialog).toBeHidden();
  await expect(dm.locator('nav.dock')).toBeHidden();
  if (test.info().project.name === 'chromium') {
    // The cover is a page of its own, on either paper.
    // The cover is a page of its own, on either paper. Saving the PDF is a print: once it is
    // over the paper goes, so the second sheet is asked for again.
    const sheets = pagesOf(await dm.pdf({ format: 'A4' }));
    expect(sheets, 'pages on A4').toBeGreaterThanOrEqual(2);
    await expect(paper).toHaveCount(0);
    await dm.emulateMedia({ media: null });
    await dialog.getByRole('button', { name: 'Print or save as PDF', exact: true }).click();
    await expect.poll(() => dm.evaluate(() => window.printed ?? 0), WAIT).toBe(2);
    expect(pagesOf(await dm.pdf({ format: 'Letter' })), 'pages on Letter').toBeGreaterThanOrEqual(
      2,
    );
    // The browser's own print command, with the book shown and no button pressed, prints the
    // book too — never an empty sheet.
    await expect(paper).toHaveCount(0);
    expect(pagesOf(await dm.pdf({ format: 'A4' })), 'pages by the browser’s print').toBe(sheets);
    expect(await dm.evaluate(() => window.printed ?? 0)).toBe(2);
  }
  await dm.emulateMedia({ media: null });
  // The print over, the paper goes.
  await dm.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(paper).toHaveCount(0);

  // The chapters are where they were: the chapter told from Elowen is the DM's to read there.
  // The two views' buttons stay under the pointer from one view to the other.
  const byChapter = dialog.getByRole('button', { name: 'By chapter', exact: true });
  const before = await byChapter.boundingBox();
  await byChapter.click();
  await expect(dialog.getByRole('button', { name: DIARY })).toBeVisible();
  expect(await byChapter.boundingBox()).toEqual(before);

  // The player's whole book is the same story; nothing read for it as the party holds a wish —
  // not Brann's, and not the player's own.
  const theirs = await openWholeBook(player);
  await expect(theirs.book).toContainText(LINE);
  await expect(theirs.book.getByRole('list', { name: 'What we loved that evening' })).toContainText(
    BRANN_STAR,
    WAIT,
  );
  await expect(theirs.book).toContainText(LETTER_TEXT);
  await expect(theirs.book).not.toContainText(DIARY);
  await expectAccessible(player, 'a player’s whole book');
  const read = (await Promise.all(asParty)).join('\n');
  expect(read).toContain(BRANN_STAR);
  expect(read, 'the book read a wish').not.toContain(WISH);
  expect(read, 'the book read a wish').not.toContain(BRANN_WISH);
  expect(read, 'the book read a chapter told from a character').not.toContain(DIARY);

  // A second evening: the cover gains the book's contents, and a press leads to a chapter.
  await dialog.getByRole('button', { name: 'Close the Chronicle', exact: true }).click();
  // The Chronicle is a page of the DM's Journal: the Session is opened again from its part.
  await openSheet(dm, 'Session');
  await sheet.getByRole('button', { name: 'Start the session', exact: true }).click();
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click(WAIT);
  await sheet
    .getByRole('group', { name: 'The evening’s moments' })
    .getByLabel('What mattered most tonight, in your own words (optional)', { exact: true })
    .fill('We crossed the river at dawn.');
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(sheet.locator('.session-ended')).toContainText(
    /Chapter written( as the plain record: [^.]+)?\./,
    WAIT,
  );
  await openChronicle(dm);
  // The Chronicle opens as it was left: by chapter.
  await dialog.getByRole('button', { name: 'The whole book', exact: true }).click();
  const contents = dialog.getByRole('navigation', { name: 'In this book' });
  await expect(contents.getByRole('button')).toHaveCount(3, WAIT);
  await expect(book.locator('.keepsake-played')).toContainText('Evenings in the book: 2');
  await contents.getByRole('button').nth(1).click();
  const second = book.getByRole('heading', { level: 4 }).nth(1);
  await expect(second).toBeFocused();
  await expect(second).toBeInViewport();
  await expect(book.locator('.keepsake-chapter').nth(1)).toContainText(
    'We crossed the river at dawn.',
  );
  await contents.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expect(book.getByRole('heading', { name: 'Shown to the party' })).toBeInViewport();
});

test('the book shows the party’s pictures, and prints once they are drawn', async ({ browser }) => {
  // One campaign, so one project: the pictures are the same in any engine's page.
  test.skip(test.info().project.name !== 'chromium', 'the curated pictures’ campaign is one');
  test.setTimeout(180_000);
  const dm = await freshPage(browser);
  await countPrints(dm);
  await enterWorld(dm, TOKENS.dm, UI_PARTY_CAMPAIGNS.bookPictures);
  // A picture shown to the whole party.
  await openSheet(dm, 'Party');
  const give = dm.locator('#sheet-party').getByRole('region', { name: 'Give a handout' });
  await give.getByLabel('Title', { exact: true }).fill('The square at noon');
  await give
    .getByLabel('Picture (optional)', { exact: true })
    .selectOption({ label: 'Market Square' });
  await give.getByRole('button', { name: 'Give the handout' }).click();
  await expect(give.getByRole('status')).toHaveText('Given.', WAIT);
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(sheet.locator('.session-ended')).toContainText(
    /Chapter written( as the plain record: [^.]+)?\./,
    WAIT,
  );
  const { dialog, book } = await openWholeBook(dm);
  // The heroes' portraits on the cover, the chapter's place, the faces met, the gallery.
  await expect(book.getByRole('list', { name: 'The heroes' }).locator('img').first()).toBeVisible(
    WAIT,
  );
  const chapter = book.getByRole('region', { name: FIRST });
  await expect(chapter.locator('.keepsake-plate img')).toBeVisible(WAIT);
  const gallery = book.getByRole('region', { name: 'Gallery' });
  // The gallery's pictures are read as the reader comes down the page to it.
  await book.evaluate((page) => {
    page.scrollTo(0, page.scrollHeight);
  });
  await expect(gallery.getByRole('heading', { name: 'Places' })).toBeVisible(WAIT);
  await expect(gallery.locator('.keepsake-tile img').first()).toBeVisible(WAIT);
  const handout = gallery.getByRole('listitem').filter({ hasText: 'The square at noon' });
  await expect(handout.locator('img')).toBeVisible(WAIT);
  await expectAccessible(dm, 'the whole book with its pictures');

  // On paper every picture is drawn before the print opens.
  await dialog.getByRole('button', { name: 'Print or save as PDF', exact: true }).click();
  await expect.poll(() => dm.evaluate(() => window.printed ?? 0), WAIT).toBe(1);
  const drawn = await dm
    .locator('body > .print-book img')
    .evaluateAll((pictures) =>
      pictures.map((picture) => (picture as HTMLImageElement).naturalWidth > 0),
    );
  expect(drawn.length).toBeGreaterThan(2);
  expect(drawn.every(Boolean), 'a picture was not drawn when the print opened').toBe(true);
  // Drawn for paper, not at the size a large screen shows: the PDF stays light enough to send.
  await dm.emulateMedia({ media: 'print' });
  const pdf = await dm.pdf({ format: 'A4' });
  expect(pagesOf(pdf)).toBeGreaterThanOrEqual(2);
  expect(pdf.length, 'the PDF’s weight in bytes').toBeLessThan(3_000_000);
});
