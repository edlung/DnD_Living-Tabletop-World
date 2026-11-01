import { expect, test, type Page } from '@playwright/test';

import type { RollEntry } from '../../packages/contracts/src/index.ts';
import { expectAccessible, WIDTHS } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter, openSheet } from './support/shell.ts';

/**
 * The table's dice (Stage 510, work-orders/STAGE_510.md): the server rolls, the dice fly and land
 * on its values with their plate, the log lists the roll once it has landed, the DM asks for a
 * check and the player answers. Each journey owns a campaign (`ui-dice-campaigns.ts`).
 */
const CAMPAIGNS = {
  roll: 'ui-dice-roll',
  sheet: 'ui-dice-sheet',
  ask: 'ui-dice-ask',
  ru: 'ui-dice-ru',
  axe: 'ui-dice-axe',
  still: 'ui-dice-still',
  plain: 'ui-dice-plain',
} as const;

/** The roll the server answered with, for the button press `press` makes. */
async function rolled(page: Page, press: () => Promise<void>): Promise<RollEntry> {
  const response = page.waitForResponse(
    (answer) =>
      new URL(answer.url()).pathname.endsWith('/rolls') && answer.request().method() === 'POST',
  );
  await press();
  const body = (await (await response).json()) as { roll: RollEntry };
  return body.roll;
}

const plate = (page: Page) => page.locator('.dice-plate');
/** How long a throw may take to land: a hosted runner's software WebGL is slow (Stage 540). */
const LANDS = 15_000;

test('free dice fly, land on the server’s values and join the log', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.roll);
  await openSheet(page, 'Dice');
  const sheet = page.locator('#sheet-dice');
  await sheet.getByRole('button', { name: 'Add a d20' }).click();
  await sheet.getByRole('button', { name: 'Add a d6' }).click();
  await sheet.getByRole('button', { name: 'Add a d6' }).click();
  await expect(sheet.locator('.dice-pool')).toHaveText('1d20 + 2d6');
  await sheet.getByLabel('Modifier').fill('3');
  const roll = await rolled(page, () =>
    sheet.getByRole('button', { name: 'Roll', exact: true }).click(),
  );
  const [group] = roll.groups;
  expect(group?.dice.map((die) => die.sides)).toEqual([20, 6, 6]);
  expect(group?.total).toBe((group?.dice ?? []).reduce((sum, die) => sum + die.value, 0) + 3);
  // The dice fly in the top layer; the plate tells the sum once they rest.
  await expect(page.locator('.dice-layer')).toBeVisible();
  await expect(plate(page)).toContainText(`= ${String(group?.total)}`, { timeout: LANDS });
  const log = sheet.getByRole('region', { name: 'Recent rolls' });
  await expect(log).toContainText(`= ${String(group?.total)}`);
  await expect(log).toContainText('Elowen Starwhisper');
  // Said once in words for screen readers.
  await expect(
    page.locator('.roll-announcer').filter({ hasText: 'Elowen Starwhisper · Dice' }),
  ).toHaveCount(1);
});

test('a check rolled from the sheet takes the sheet’s bonus', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.sheet);
  const skills = await openCharacter(page, 'Skills');
  const roll = await rolled(page, () =>
    skills.getByRole('button', { name: /^Roll Perception/ }).click(),
  );
  expect(roll.subject).toEqual({ kind: 'skill', skill: 'perception' });
  expect(roll.groups[0]?.modifier).toBe(12);
  // Over the open character dialog.
  await expect(plate(page)).toContainText('Perception check');
  await expect(plate(page)).toContainText(`= ${String(roll.groups[0]?.total)}`, {
    timeout: LANDS,
  });
});

test('the DM asks for a check with a hidden DC, and the player answers it', async ({ browser }) => {
  const dmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const dm = await dmContext.newPage();
  const player = await playerContext.newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGNS.ask);
  await enterWorld(player, TOKENS.player, CAMPAIGNS.ask);
  await openSheet(dm, 'Dice');
  const dmSheet = dm.locator('#sheet-dice');
  await dmSheet
    .getByLabel('Check', { exact: true })
    .last()
    .selectOption({ label: 'Dexterity saving throw' });
  await dmSheet.getByLabel('Difficulty (DC), seen only by you').fill('15');
  await dmSheet.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(dmSheet.getByRole('region', { name: 'Requests' })).toContainText(
    'Waiting for the roll',
  );

  await openSheet(player, 'Dice');
  const asked = player.locator('#sheet-dice').getByRole('region', { name: 'The DM asks' });
  await expect(asked).toContainText('Dexterity saving throw');
  await expect(player.locator('body')).not.toContainText('DC 15');
  const roll = await rolled(player, () => asked.getByRole('button', { name: 'Roll' }).click());
  expect(roll.groups[0]?.modifier).toBe(9);
  const total = roll.groups[0]?.total ?? 0;
  const requests = dmSheet.getByRole('region', { name: 'Requests' });
  await expect(requests).toContainText(String(total));
  await expect(requests).toContainText(total >= 15 ? 'Success' : 'Failure');
  await expect(asked).toHaveCount(0);
  await dmContext.close();
  await playerContext.close();
});

test('without motion the plate still tells the roll', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await enterWorld(page, TOKENS.player, CAMPAIGNS.still);
  await openSheet(page, 'Dice');
  const sheet = page.locator('#sheet-dice');
  await sheet.getByRole('button', { name: 'Add a d8' }).click();
  const roll = await rolled(page, () =>
    sheet.getByRole('button', { name: 'Roll', exact: true }).click(),
  );
  await expect(plate(page)).toContainText(String(roll.groups[0]?.total));
  await context.close();
});

test('without WebGL the plate still tells the server’s numbers at once', async ({ page }) => {
  // A browser with no WebGL (no GPU, acceleration off): the throw is left out, never the roll.
  await page.addInitScript(() => {
    type GetContext = (
      this: HTMLCanvasElement,
      kind: string,
      options?: unknown,
    ) => RenderingContext | null;
    const original = Reflect.get(HTMLCanvasElement.prototype, 'getContext') as GetContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value(this: HTMLCanvasElement, kind: string, options?: unknown) {
        return kind.startsWith('webgl') ? null : original.call(this, kind, options);
      },
    });
  });
  await enterWorld(page, TOKENS.player, CAMPAIGNS.plain);
  await openSheet(page, 'Dice');
  const sheet = page.locator('#sheet-dice');
  await sheet.getByRole('button', { name: 'Add a d20' }).click();
  await sheet.getByLabel('Modifier').fill('1');
  const roll = await rolled(page, () =>
    sheet.getByRole('button', { name: 'Roll', exact: true }).click(),
  );
  await expect(plate(page)).toContainText(`= ${String(roll.groups[0]?.total)}`, { timeout: 3000 });
  const log = sheet.getByRole('region', { name: 'Recent rolls' });
  await expect(log).toContainText(`= ${String(roll.groups[0]?.total)}`);
});

test('the Russian dice read only Russian', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.ru);
  await openSheet(page, 'Кубики');
  const sheet = page.locator('#sheet-dice');
  await expect(sheet.getByRole('heading', { name: 'Бросить кубики' })).toBeVisible();
  const text = await sheet.innerText();
  const latin = (text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? []).filter(
    (word) => !/^d\d+$/.test(word),
  );
  expect(latin).toEqual([]);
});

for (const size of WIDTHS) {
  test(`the Dice sheet passes axe at ${size.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await enterWorld(page, TOKENS.player, CAMPAIGNS.axe);
    await openSheet(page, 'Dice');
    await page.locator('#sheet-dice').getByRole('button', { name: 'Add a d20' }).click();
    await expectAccessible(page, `${size.name} dice sheet`);
  });
}
