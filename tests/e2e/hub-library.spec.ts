import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
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
 * The campaign library in the hub (docs/adr/0058-campaign-content.md, notes of 2026-11-19; ADR
 * 0075 §20): a DM signed in with a login, and no workshop invitation, sees the library on shelves
 * by the age its books are written for — the youngest first, a shelf one row with the rest a press
 * away, the ages an index at its head — looks inside a book, picks a party size and starts it; the
 * campaign opens with the login as its DM, and the shelf then lists it beside the book that is
 * gone on with. No trace or screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 60_000 };

test('a login starts a library campaign from the hub as its DM', async ({ browser }) => {
  test.setTimeout(240_000);
  const words = WORDS.en;
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.hubLibrary)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Mira');
  await invited.getByLabel('Login', { exact: true }).fill('mira-library');
  await invited.getByLabel('Password', { exact: true }).fill('a lantern in the rain');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);

  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  // The campaign the login sits in has an evening under way: it is the book the shelf goes on
  // with — under its ribbon, its door the shelf's first press.
  const yours = dm
    .getByRole('region', { name: 'Your campaigns', exact: true })
    .getByRole('list', { name: 'Your campaigns', exact: true })
    .getByRole('listitem');
  await expect(yours).toHaveCount(1, LIVE);
  await expect(yours.first()).toContainText('An evening is under way since');
  await expect(
    yours.first().getByRole('button', { name: /^Continue The Missing Caravan: You are the DM$/ }),
  ).toHaveText('Continue');
  await expect(yours.first().locator('.shelf-ribbon')).toBeVisible();

  const library = dm.getByRole('region', { name: 'Campaigns from the library', exact: true });
  const cards = library.getByRole('listitem');
  await expect(cards.first()).toBeVisible(LIVE);
  expect(await cards.count()).toBeGreaterThanOrEqual(15);
  // The shelves stand by age, the youngest first, and the index at the library's head names each.
  const shelves = library.getByRole('region', { name: /^Ages \d+\+$/ });
  const ages = (await shelves.getByRole('heading', { level: 4 }).allTextContents()).map((plate) =>
    Number.parseInt(plate.replace('Ages ', ''), 10),
  );
  expect(ages.length).toBeGreaterThanOrEqual(3);
  expect(ages).toEqual([...ages].sort((one, other) => one - other));
  const index = library.getByRole('navigation', { name: 'Shelves by age', exact: true });
  await expect(index.getByRole('link')).toHaveText(ages.map((age) => `${String(age)}+`));
  // A shelf longer than a row shows one row; its head unfolds it and folds it again.
  // (Found by its plate: unfolded, its head says "Fold the shelf".)
  const plate = await shelves
    .filter({ has: dm.getByRole('button', { name: /^The whole shelf: \d+$/ }) })
    .first()
    .getByRole('heading', { level: 4 })
    .innerText();
  const long = library.getByRole('region', { name: plate, exact: true });
  const whole = long.getByRole('button', { name: /^The whole shelf: \d+$/ });
  const count = Number.parseInt(((await whole.textContent()) ?? '').replace(/\D+/g, ''), 10);
  const row = await long.getByRole('listitem').count();
  expect(row).toBeLessThan(count);
  const tops = await long
    .getByRole('listitem')
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size, 'a folded shelf is one row').toBe(1);
  await whole.click();
  await expect(long.getByRole('listitem')).toHaveCount(count);
  const fold = long.getByRole('button', { name: 'Fold the shelf', exact: true });
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await fold.click();
  await expect(long.getByRole('listitem')).toHaveCount(row);
  // The index comes to a shelf.
  const lastAge = `${String(ages.at(-1))}+`;
  await index.getByRole('link', { name: lastAge, exact: true }).click();
  await expect(
    library.getByRole('heading', { level: 4, name: `Ages ${lastAge}`, exact: true }),
  ).toBeInViewport();
  // Every cover is served to the signed-in account.
  const covers = await library
    .locator('img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? ''));
  for (const src of covers.slice(0, 3)) expect((await dm.request.get(src)).status()).toBe(200);
  await expectAccessible(dm, 'the hub with the campaign library');

  // A campaign is a book on the shelf: the book with its caption is one press that opens its
  // first page, where the smallest party it offers starts it.
  const card = cards.first();
  const theme = await card.getAttribute('data-campaign-theme');
  expect(theme).toBeTruthy();
  const material = await dm.request.get(`/table-materials/${theme}.webp`);
  expect(material.status()).toBe(200);
  expect(material.headers()['content-type']).toMatch(/image\/webp/);
  const title = (await card.locator('.shelf-caption strong').textContent()) ?? '';
  const book = card.getByRole('button', { name: `Look inside the book «${title}»`, exact: true });
  await expect(book).toHaveAccessibleDescription(/\S/);
  await book.click();
  const look = dm.getByRole('dialog', { name: title, exact: true });
  await expect(look).toBeVisible();
  await expectAccessible(dm, 'a library book looked inside');
  // Escape puts the book back and returns to it; it opens again.
  await dm.keyboard.press('Escape');
  await expect(look).toBeHidden();
  await expect(book).toBeFocused();
  await book.click();
  const players = look.getByLabel('Players', { exact: true });
  const first = await players.locator('option').first().getAttribute('value');
  await players.selectOption(first ?? '');
  await look.getByRole('button', { name: `Start «${title}»`, exact: true }).click();
  await expect(look.getByRole('status')).toContainText('up to a minute or two');
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);

  // The library's campaigns are written in Russian: the world speaks it. The hub now lists the
  // campaign, with the login as its DM: no evening was played in it, so it is opened, and the
  // book with the evening under way stays the one gone on with.
  await expect(dm.getByRole('combobox', { name: 'Вид', exact: true })).toHaveValue(/.+/);
  await expect(dm.locator('.session-shell')).toHaveAttribute('data-campaign-theme', theme ?? '');
  await dm.getByRole('button', { name: 'Мои кампании', exact: true }).click();
  await expect(yours).toHaveCount(2, LIVE);
  const started = yours.filter({ hasText: title });
  await expect(started).toContainText('You are the DM');
  await expect(started.getByRole('button', { name: /^Open / })).toHaveText('Open');
  await expect(yours.first().getByRole('button', { name: /^Continue / })).toHaveText('Continue');
  await expect(yours.first()).not.toContainText(title);
});
