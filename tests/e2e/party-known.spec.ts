import { expect, test, type Page } from '@playwright/test';

import boundary from '../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openChronicle } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The party's encyclopedia (docs/adr/0073-table-ideas.md §4, Stage 830): "What we know" in the
 * Chronicle gathers who the party has met, where it has been and what it has learned — for a
 * player and for the DM alike, read as the party: the DM's page holds none of the DM's secrets,
 * and nothing it was sent for it does. A name is found by typing it; a chapter that tells of
 * someone opens from their entry. Chromium on a laptop and WebKit on an iPad, each on a campaign
 * of its own.
 */
const campaignOf = () =>
  test.info().project.name === 'ipad' ? UI_PARTY_CAMPAIGNS.knownIpad : UI_PARTY_CAMPAIGNS.known;

const WAIT = { timeout: 20_000 };
const CHAPTER = 'The road north';
const FORBIDDEN = boundary.forbiddenMarkers.PARTY;

/** Everything a page is sent in the party's view, from now on. */
function collectPartyReads(page: Page): () => Promise<string> {
  const bodies: Promise<string>[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).searchParams.get('perspective') === 'PARTY') {
      bodies.push(response.text().catch(() => ''));
    }
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

async function openKnown(page: Page) {
  await openChronicle(page);
  const dialog = page.locator('dialog.chronicle-dialog');
  await dialog.getByRole('button', { name: 'What we know', exact: true }).click();
  const known = dialog.getByRole('region', { name: 'What the party knows' });
  await expect(known.getByRole('heading', { level: 2, name: 'What we know' })).toBeVisible(WAIT);
  return { dialog, known };
}

test('what the party knows is one page, the same for the DM and a player', async ({ browser }) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);

  // The DM writes a chapter told from the Party: the page names it where it tells of someone.
  await openChronicle(dm);
  const chronicle = dm.locator('dialog.chronicle-dialog');
  await chronicle.getByText('Write a chapter (DM)', { exact: true }).click();
  await chronicle.getByLabel('Title', { exact: true }).fill(CHAPTER);
  await chronicle.getByLabel('Told from', { exact: true }).selectOption({ label: 'Party' });
  await chronicle.getByRole('button', { name: 'Write chapter', exact: true }).click();
  await expect(chronicle.getByRole('button', { name: CHAPTER })).toBeVisible(WAIT);
  await chronicle.getByRole('button', { name: 'Close the Chronicle', exact: true }).click();

  // A player opens "What we know": people, places, what else the party has learned.
  const playerReads = collectPartyReads(player);
  const mine = await openKnown(player);
  const people = mine.known.getByRole('region', { name: /^People and creatures/ });
  await expect(people.getByRole('heading', { level: 4, name: 'Mira Vale' })).toBeVisible(WAIT);
  const places = mine.known.getByRole('region', { name: /^Places/ });
  await expect(places.getByRole('heading', { level: 4, name: 'Market Square' })).toBeVisible();
  // What the party knows of someone is under their name.
  const mira = people.locator('.known-entry').filter({
    has: player.getByRole('heading', { level: 4, name: 'Mira Vale' }),
  });
  await expect(mira.locator('.known-facts li').first()).toBeVisible();
  await expectAccessible(player, 'the party’s encyclopedia, as a player reads it');

  // A name is found by typing a part of it.
  const find = mine.known.getByLabel('Find a name', { exact: true });
  await find.fill('mira');
  await expect(mine.known.getByRole('status')).toHaveText(/^Names found: \d+$/);
  await expect(people.getByRole('heading', { level: 4 })).toHaveText(['Mira Vale']);
  await expect(places).toHaveCount(0);
  await find.fill('zzzz');
  await expect(mine.known.getByRole('status')).toHaveText(
    'No name like that is known to the party.',
  );
  await find.fill('');

  // The DM's page is the party's too: the same names, and none of the DM's secrets.
  const dmReads = collectPartyReads(dm);
  const theirs = await openKnown(dm);
  await expect(theirs.known.getByRole('heading', { level: 4, name: 'Mira Vale' })).toBeVisible(
    WAIT,
  );
  const names = async (page: Page) =>
    page.locator('dialog.chronicle-dialog .known-entry h4').allTextContents();
  expect(await names(dm)).toEqual(await names(player));
  const shown = await theirs.known.innerHTML();
  const sent = await dmReads();
  expect(sent.length).toBeGreaterThan(0);
  for (const marker of FORBIDDEN) {
    expect(shown, `the DM’s page shows ${marker}`).not.toContain(marker);
    expect(sent, `the DM’s page was sent ${marker}`).not.toContain(marker);
  }
  expect(await playerReads()).not.toContain(FORBIDDEN[0]);
  await expectAccessible(dm, 'the party’s encyclopedia, as the DM reads it');

  // A chapter that tells of someone opens from their entry, in the book.
  const told = theirs.known.locator('.known-chapters').getByRole('button', { name: CHAPTER });
  if ((await told.count()) > 0) {
    await told.first().click();
    await expect(
      theirs.dialog.getByRole('button', { name: 'By chapter', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(theirs.dialog.getByRole('button', { name: CHAPTER })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
});

test('по-русски: «Что мы знаем»', async ({ browser }) => {
  test.skip(test.info().project.name !== 'chromium', 'The words are the same on every engine.');
  test.setTimeout(90_000);
  const page = await freshPage(browser);
  await enterWorld(page, TOKENS.player, UI_PARTY_CAMPAIGNS.knownRu);
  await openChronicle(page, 'Хроника');
  const dialog = page.locator('dialog.chronicle-dialog');
  await dialog.getByRole('button', { name: 'Что мы знаем', exact: true }).click();
  const known = dialog.getByRole('region', { name: 'Что знает отряд' });
  await expect(known.getByRole('heading', { level: 2, name: 'Что мы знаем' })).toBeVisible(WAIT);
  await expect(known.getByRole('region', { name: /^Люди и существа/ })).toBeVisible(WAIT);
  await expect(known.getByRole('region', { name: /^Места/ })).toBeVisible();
  await expect(known.getByLabel('Найти по имени или названию', { exact: true })).toBeVisible();
  await expectAccessible(page, 'энциклопедия отряда');
});
