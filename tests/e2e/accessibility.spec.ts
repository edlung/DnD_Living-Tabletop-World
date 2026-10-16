import { expect, test, type Page } from '@playwright/test';

import campaigns from './fixtures/dm-tool-campaigns.json' with { type: 'json' };
import { dmRequest, TOMAS_REQUEST } from './support/authoring.ts';
import { expectAccessible, WIDTHS } from './support/axe.ts';
import { battlefield, square, turnTray } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeSheet, dockButton, openSheet } from './support/shell.ts';

/**
 * Accessibility at the three widths (docs/STAGE_320_DESIGN.md §6–7): automated axe scans of
 * sign-in, the scene with a selection, a conversation, every DM sheet, and the battlefield (the
 * player's turn, a chosen target with a previewed area, the reaction prompt, the DM's Encounter
 * sheet) fail on any serious or critical violation, colour contrast included, and no width may
 * scroll the page sideways. Read-only — talking records nothing, and the scans only look —
 * except the scans of the DM's tools with content (which adds Tomas) and of the Chronicle book
 * and a flashback (which writes a chapter), each in a campaign of its own.
 */

// Several states at three widths, each read whole by axe: on a two-core CI runner, beside the
// servers and a second worker, such a test takes several times its local 5–15 s.
test.describe.configure({ timeout: 120_000 });
for (const size of WIDTHS) {
  test(`sign-in, scene, conversation and every DM sheet pass axe at ${size.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await expect(page.getByLabel('Access token', { exact: true })).toBeVisible();
    await expectAccessible(page, `${size.name} sign-in`);

    await enterWorld(page);
    const mira = page.getByRole('button', { name: 'Mira Vale', exact: true });
    await mira.click();
    const details = page.getByRole('complementary', { name: 'Entity details' });
    await expect(details.getByRole('button', { name: 'Talk', exact: true })).toBeVisible();
    await expectAccessible(page, `${size.name} scene with a selection`);

    await details.getByRole('button', { name: 'Talk', exact: true }).click();
    await expect(
      page.getByText('No spoken reply is available. You can still ask about a subject.'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Conversation with Mira Vale' })).toBeAttached();
    await expectAccessible(page, `${size.name} conversation`);

    await page.getByRole('button', { name: 'Leave session', exact: true }).click();
    await enterWorld(page, TOKENS.dm);
    // Every DM tool's sheet: what it shows before anything is done.
    const sheets = [
      ['Add to the world', page.getByLabel('Describe what to add', { exact: true })],
      ['Encounter', page.locator('#sheet-encounter .dm-combat')],
      ['Time and weather', page.getByRole('button', { name: 'Set weather' })],
      ['History', page.getByRole('region', { name: 'DM history', exact: true })],
    ] as const;
    for (const [sheet, shown] of sheets) {
      await openSheet(page, sheet);
      await expect(shown).toBeVisible();
      await expectAccessible(page, `${size.name} DM sheet ${sheet}`);
      await closeSheet(page, sheet);
    }
  });
}

/** Scans the page at each width, then returns to the default size. */
async function atEveryWidth(page: Page, what: string): Promise<void> {
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    // Two frames at the new width: the board has fitted itself to its new space.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    await expectAccessible(page, `${size.name} ${what}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

// The battlefield, read-only (choosing squares and combatants only reads their options): each
// state signed in once and scanned at the three widths, as the layout follows the width.
test('the battlefield passes axe: the player’s turn and a target with a previewed area', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player, 'ui-combat-preview');
  await expect(turnTray(page).getByRole('button', { name: 'End turn' })).toBeVisible();
  await atEveryWidth(page, 'player turn');

  await square(page, 11, 5).click();
  const options = battlefield(page).getByRole('region', {
    name: 'Options for Unidentified creature 3',
  });
  await expect(options).toContainText('Would affect:');
  await expect(square(page, 11, 5)).toHaveAccessibleName(/in the area/);
  await atEveryWidth(page, 'target with a previewed area');
});

test('the battlefield passes axe: the reaction prompt', async ({ page }) => {
  await enterWorld(page, TOKENS.player, 'ui-combat');
  await expect(page.getByRole('alertdialog', { name: 'Reaction: Counterspell' })).toBeVisible();
  await atEveryWidth(page, 'reaction prompt');
});

test('the battlefield passes axe: the DM’s Encounter sheet', async ({ page }) => {
  await enterWorld(page, TOKENS.dm, 'ui-combat');
  await openSheet(page, 'Encounter');
  await expect(page.getByRole('button', { name: 'Close reaction window' })).toBeVisible();
  await atEveryWidth(page, 'DM encounter sheet');
});

test('the DM’s tools with content pass axe: a proposal card and the history with an entry', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, campaigns.a11y);
  await openSheet(page, 'Add to the world');
  await page.getByLabel('Describe what to add', { exact: true }).fill(TOMAS_REQUEST);
  await page.getByRole('button', { name: 'Propose', exact: true }).click();
  const card = page.getByRole('region', { name: 'Authoring proposal', exact: true });
  await expect(card.getByRole('list', { name: 'Proposed changes' })).toBeVisible();
  await atEveryWidth(page, 'proposal card');
  await card.getByRole('button', { name: 'Confirm and add to the world' }).click();
  await expect(card).toContainText('Added to the world · revision 1');
  await openSheet(page, 'History');
  const history = page.getByRole('region', { name: 'DM history', exact: true });
  await expect(history.getByRole('button', { name: 'Undo this addition' })).toBeVisible();
  await atEveryWidth(page, 'history with an entry');
});

test('the Chronicle book and a flashback pass axe', async ({ page }) => {
  const campaign = campaigns.a11yBook;
  const written = await dmRequest(page, campaign, 'post', 'chronicle', {
    title: 'Chapter I — Shadows on the Trade Road',
    perspective: 'CHARACTER:elowen-starwhisper',
    from: 0,
  });
  expect(written.body).toMatchObject({ result: { status: 'accepted' } });
  await enterWorld(page, TOKENS.player, campaign);
  const book = page.getByRole('dialog', { name: 'Chronicle' });
  const open = book.getByRole('button', { name: 'Open flashback' }).first();
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await dockButton(page, 'Chronicle').click();
    await expect(book.getByRole('article')).toBeVisible();
    // A spread on a wide screen, one parchment page below it.
    await expect(page.locator('.book-spread-art')).toBeVisible({
      visible: size.name === 'desktop',
    });
    await expectAccessible(page, `${size.name} Chronicle book`);
    await open.click();
    await expect(book.getByRole('region', { name: 'Flashback' })).toBeFocused();
    await expectAccessible(page, `${size.name} flashback`);
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(book).toBeHidden();
  }
});

test('the Russian scene with a selection passes axe at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterWorld(page, TOKENS.player, 'ui-ru-player');
  await page.getByRole('button', { name: 'Мира Вейл', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что вы хотите сделать?' })).toBeVisible();
  await expectAccessible(page, 'Russian phone scene with a selection');
});

test('Escape closes the topmost sheet, panel or book and returns focus', async ({ page }) => {
  await enterWorld(page);
  const places = dockButton(page, 'Places');
  await places.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sheet-places')).toBeFocused();
  // The selection opened after the sheet is the topmost: Escape closes it first.
  const mira = page.getByRole('button', { name: 'Mira Vale', exact: true });
  await mira.focus();
  await page.keyboard.press('Enter');
  const details = page.getByRole('complementary', { name: 'Entity details' });
  await expect(details).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(mira).toBeFocused();
  await expect(page.locator('#sheet-places')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet-places')).toBeHidden();
  await expect(places).toBeFocused();
  // The Chronicle is a modal book: Escape closes it and focus returns to the dock.
  const chronicle = dockButton(page, 'Chronicle');
  await chronicle.click();
  await expect(page.getByRole('dialog', { name: 'Chronicle' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Chronicle' })).toBeHidden();
  await expect(chronicle).toBeFocused();
});
