import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { battlefield, square, turnTray } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { dockButton, openSheet } from './support/shell.ts';

/**
 * Accessibility at the three widths (docs/STAGE_320_DESIGN.md §6–7): automated axe scans of
 * sign-in, the scene with a selection, a conversation, a DM sheet, and the battlefield (the
 * player's turn, a chosen target with a previewed area, the reaction prompt, the DM's Encounter
 * sheet) fail on any serious or critical violation, colour contrast included, and no width may
 * scroll the page sideways. Read-only: talking records nothing, and the scans only look.
 */
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

/**
 * Text over the GPT art sits on glass at least 88 % opaque (design §7). Axe cannot read a
 * colour through pictures and gradients and leaves such text unchecked, so its contrast rule
 * runs a second time with the art and gradients set aside: every text against its own panel.
 */
const FLAT =
  '*, *::before, *::after { background-image: none !important; } ' +
  '.stage-backdrop img, .sign-in-art { visibility: hidden !important; }';

const listed = (violations: readonly { id: string; nodes: { target: unknown[] }[] }[]) =>
  violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );

async function expectAccessible(page: Page, where: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow, `${where}: the page scrolls sideways`).toBe(false);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(listed(blocking), `${where}: serious or critical axe violations`).toEqual([]);
  const flat = await page.addStyleTag({ content: FLAT });
  const contrast = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  await flat.evaluate((node) => {
    node.parentNode?.removeChild(node);
  });
  expect(listed(contrast.violations), `${where}: text contrast on its panels`).toEqual([]);
}

for (const size of WIDTHS) {
  test(`sign-in, scene, conversation and a DM sheet pass axe at ${size.name} width`, async ({
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
    await openSheet(page, 'Time and weather');
    await expect(page.getByRole('button', { name: 'Set weather' })).toBeVisible();
    await expectAccessible(page, `${size.name} DM sheet`);
  });
}

for (const size of WIDTHS) {
  test(`the battlefield passes axe at ${size.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    // Read-only: choosing squares and combatants only reads their options.
    await enterWorld(page, TOKENS.player, 'ui-combat-preview');
    await expect(turnTray(page).getByRole('button', { name: 'End turn' })).toBeVisible();
    await expectAccessible(page, `${size.name} player turn`);

    await square(page, 11, 5).click();
    const options = battlefield(page).getByRole('region', { name: 'Options for goblin-raider-3' });
    await expect(options).toContainText('Would affect:');
    await expect(square(page, 11, 5)).toHaveAccessibleName(/in the area/);
    await expectAccessible(page, `${size.name} target with a previewed area`);

    await page.getByRole('button', { name: 'Leave session', exact: true }).click();
    await enterWorld(page, TOKENS.player, 'ui-combat');
    await expect(page.getByRole('alertdialog', { name: 'Reaction: Counterspell' })).toBeVisible();
    await expectAccessible(page, `${size.name} reaction prompt`);

    await page.getByRole('button', { name: 'Leave session', exact: true }).click();
    await enterWorld(page, TOKENS.dm, 'ui-combat');
    await openSheet(page, 'Encounter');
    await expect(page.getByRole('button', { name: 'Close reaction window' })).toBeVisible();
    await expectAccessible(page, `${size.name} DM encounter sheet`);
  });
}

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
