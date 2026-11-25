import { expect as baseExpect, type Locator, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { test } from './support/journey.ts';
import { TOKENS, enterWorld } from './support/session.ts';
import { expectOnTop } from './support/shell.ts';

/**
 * The Scene as a spread (docs/adr/0075-book-interface.md §5): on a wide screen the place is the
 * left page — its name, who and what is here, the ways beyond — and the plate and the card of what
 * is chosen the right. On a phone it stays one page under its picture. The DM's ribbon hangs at the
 * spine with its chapter, and the story's place opens the Scene: every campaign has a book now,
 * the English adventure's assembled from its own world.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

const scene = (page: Page) => page.getByRole('region', { name: 'Scene', exact: true });
const card = (page: Page) => page.getByRole('complementary', { name: 'Entity details' });
const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not drawn');
  return found;
};

test('a player’s Scene is a spread: the place on the left, the plate and the card on the right', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterWorld(page);
  await expect(scene(page)).toHaveAttribute('data-spread', '');
  await expect(scene(page)).toHaveAttribute('data-surface', 'paper');
  await expect(scene(page).getByRole('heading', { level: 2 })).toHaveText('Market Square');
  const hint = page.locator('.spread-card-hint');
  await expect(hint).toBeVisible();

  // The card opens on the right page, past the spine; the hint gives it its place.
  await scene(page).getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await expect(card(page)).toBeVisible();
  await expect(hint).toBeHidden();
  const left = await box(scene(page));
  const right = await box(card(page));
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
  await expect(card(page)).toHaveAttribute('data-surface', 'paper');
  // Who and what is here stay reachable beside the card, and the plate is above it.
  for (const name of ['Brann Ironvale', 'Elowen Starwhisper', 'Mira Vale'])
    await expectOnTop(scene(page).getByRole('button', { name, exact: true }));
  const plate = await box(page.locator('.stage-backdrop'));
  expect(plate.y + plate.height).toBeLessThanOrEqual(right.y + 1);
  await expectAccessible(page, 'the Scene as a spread with a card');

  // A talk takes the plate's place on the right page, the card under it; who and what is here
  // stay in view on the left.
  await card(page).getByRole('button', { name: 'Talk', exact: true }).click();
  const talk = page.getByRole('region', { name: 'Conversation with Mira Vale' });
  await expect(talk).toBeVisible();
  const spoken = await box(talk);
  expect(spoken.x).toBeGreaterThanOrEqual(left.x + left.width);
  // (The card takes its place a frame after the talk is measured: the page is asked until it has.)
  await expect
    .poll(async () => {
      const said = await box(talk);
      return said.y + said.height - (await box(card(page))).y;
    })
    .toBeLessThanOrEqual(1);
  for (const name of ['Brann Ironvale', 'Tamsin Quickfoot', 'Mira Vale'])
    await expectOnTop(scene(page).getByRole('button', { name, exact: true }));
  await expectAccessible(page, 'a talk on the spread');

  // A laptop keeps the spread, and so does an upright tablet or a window some 760 px wide: two
  // pages from 701 px (§25). A phone's Scene is one page under its picture.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(scene(page)).toHaveAttribute('data-spread', '');
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(scene(page)).toHaveAttribute('data-spread', '');
  await page.setViewportSize({ width: 766, height: 799 });
  await expect(scene(page)).toHaveAttribute('data-spread', '');
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(scene(page)).not.toHaveAttribute('data-spread', '');
  await expect(page.locator('.spread-card-hint')).toHaveCount(0);
});

test('the DM’s ribbon hangs over the Scene and the story’s place opens it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterWorld(page, TOKENS.dm);
  await expect(scene(page)).toHaveAttribute('data-spread', '');
  const ribbon = page.getByRole('button', { name: /^The ribbon is in chapter 1, “/ });
  await expectOnTop(ribbon);
  await ribbon.click();

  // The book no one wrote for this adventure is assembled from its world: its own words only.
  const book = page.locator('#sheet-book');
  await expect(book).toBeVisible();
  await expect(book).toContainText('Assembled from the campaign itself');
  await expect(ribbon).toBeHidden();
  const place = book.getByRole('button', { name: /^Open .+ in the Scene$/ });
  const name = ((await place.textContent()) ?? '').trim();
  await place.click();

  // The Scene shows that place's card on the right page, the book closed at its place.
  await expect(book).toBeHidden();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('heading', { name, exact: true })).toBeVisible();
  await expectOnTop(ribbon);
});
