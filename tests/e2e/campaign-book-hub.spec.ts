import { expect, test } from '@playwright/test';

import { closePages, freshPage } from './support/pages.ts';
import { openChronicle, openSheet, openTopMenu } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  joinPath,
} from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * "The book" on a campaign's card in the account's list (docs/adr/0072-keepsakes.md §1, Stage
 * 770), on the invitation-mode servers where accounts live: a campaign with no chapter has no such
 * button, and its Chronicle's book says where it begins; once an evening has its chapter the card
 * opens the campaign at its book; the door beside it — "Continue", for the book whose evening is
 * the latest (ADR 0075 §20) — opens the campaign as before. No trace or screenshot is kept: the
 * pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 20_000 };

test('the list of campaigns opens a campaign at its book', async ({ browser }) => {
  test.setTimeout(180_000);
  const words = WORDS.en;
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.book)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Ada');
  await invited.getByLabel('Login', { exact: true }).fill('ada-book');
  await invited.getByLabel('Password', { exact: true }).fill('a lantern in the rain');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);

  // No chapter yet: the Chronicle's book says where it begins and has nothing to print; the
  // campaign's card offers no book.
  await openChronicle(dm);
  const dialog = dm.locator('dialog.chronicle-dialog');
  await dialog.getByRole('button', { name: 'The whole book', exact: true }).click();
  const book = dialog.getByRole('region', { name: 'The book of the campaign' });
  await expect(book).toContainText(
    'The book is still empty. Its first chapter appears after the first evening of play.',
    LIVE,
  );
  await expect(dialog.getByRole('button', { name: 'Print or save as PDF' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'By chapter', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close the Chronicle', exact: true }).click();
  await openTopMenu(dm);
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const list = dm.getByRole('region', { name: 'Your campaigns', exact: true });
  await expect(list.getByRole('button', { name: /^Continue / })).toBeVisible(LIVE);
  await expect(list.getByRole('button', { name: /^The book of / })).toHaveCount(0);

  // The first evening closes with its chapter: the card gains "The book", which opens the
  // campaign at its book.
  await list.getByRole('button', { name: /^Continue / }).click();
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await sheet
    .getByRole('group', { name: 'The evening’s moments' })
    .getByLabel('What mattered most tonight, in your own words (optional)', { exact: true })
    .fill('We swore to find the missing caravan.');
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(sheet.locator('.session-ended')).toContainText(
    /Chapter written( as the plain record: [^.]+)?\./,
    LIVE,
  );
  await openTopMenu(dm);
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await list.getByRole('button', { name: /^The book of / }).click(LIVE);
  await expect(dialog).toBeVisible(LIVE);
  await expect(dialog.getByRole('button', { name: 'The whole book', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(book.getByRole('heading', { level: 4 })).toContainText('Session 1', LIVE);
  await expect(book).toContainText('We swore to find the missing caravan.');

  // The asking was spent: opening the campaign again shows the world, not the book.
  await dialog.getByRole('button', { name: 'Close the Chronicle', exact: true }).click();
  await openTopMenu(dm);
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await list.getByRole('button', { name: /^Continue / }).click(LIVE);
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);
  await expect(dialog).toBeHidden();
});
