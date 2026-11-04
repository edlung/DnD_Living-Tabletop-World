import { expect, test } from '@playwright/test';

import { dockSettled, openChronicle } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, WORDS, joinAsDm } from './support/sign-in.ts';

/**
 * The DM's chapter writer (docs/STAGE_320_DESIGN.md §5.6) on a screen that changes width, on the
 * invitation-mode servers: a tablet turned upright, a window made narrow. Chromium keeps a closed
 * disclosure's content out of layout, and the writer's form left there kept the width of the
 * window it was closed at: 752 px on a 390 px phone, or nothing at all (`shell/opening.tsx`).
 */
// A trace snapshots the page after each step, which lays the closed form out again and hides the
// defect: this journey runs without one.
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off' });

test('the chapter writer opens at the window’s width after the window narrowed while it was closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await joinAsDm(page, SIGN_IN_CAMPAIGNS.chronicleWriter, 0, WORDS.en);
  await openChronicle(page);
  const book = page.getByRole('dialog', { name: 'Chronicle' });
  const write = book.getByText('Write a chapter (DM)', { exact: true });
  const title = book.getByLabel('Title', { exact: true });
  await write.click();
  await title.fill('Chapter II — The Fens');
  await write.click();
  // Closed: asked of the disclosure alone, since looking at the form lays it out again.
  await expect(book.locator('details.book-writer')).not.toHaveAttribute('open');
  await page.setViewportSize({ width: 390, height: 900 });
  // A person opens it later: the narrowed window paints first.
  await dockSettled(page);
  await write.click();
  await expect(title).toBeVisible();
  // The draft title survives closing; the form lies within the phone's width.
  await expect(title).toHaveValue('Chapter II — The Fens');
  const form = await book.locator('.book-writer-form').boundingBox();
  expect(form?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((form?.x ?? 0) + (form?.width ?? 1000)).toBeLessThanOrEqual(390);
  await expect(book.getByRole('button', { name: 'Write chapter' })).toBeInViewport();
});
