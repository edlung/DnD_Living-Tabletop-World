import { expect as baseExpect, test, type Page } from '@playwright/test';

import { expectAccessible, WIDTHS } from './support/axe.ts';
import { takeWizardLevel } from './support/levels.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter, openSheet } from './support/shell.ts';

/** Several browsers wait on each other's changes: a hosted runner is about four times slower. */
const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Rests, Hit Point Dice, levels and the quest log (Stage 530, work-orders/STAGE_530.md): the DM
 * calls a rest from Time and weather, the player spends a Hit Point Die the server rolls, the DM
 * takes a level for a character (Stage 660); the Journal tells the party's quest. Elowen starts each campaign at 30 of 78
 * hit points (`ui-rest-campaigns.ts`); each journey owns its campaign.
 */
const CAMPAIGNS = {
  short: 'ui-rest-short',
  long: 'ui-rest-long',
  ru: 'ui-rest-ru',
  axe: 'ui-rest-axe',
  notice: 'ui-rest-notice',
  cut: 'ui-rest-cut',
  hazard: 'ui-rest-hazard',
} as const;

const banner = (page: Page) => page.locator('.rest-banner');
/** A change another browser made arrives through the live signal: slower on a hosted runner. */
const LIVE = 15_000;
/** The character card's hit points, "current / max" (a hidden "of" reads them aloud). */
const hitPoints = (page: Page, current: number, max: number) =>
  expect(page.getByRole('dialog').locator('.hero-hp-value')).toHaveText(
    new RegExp(`^${String(current)}\\s*/\\s*of\\s*${String(max)}$`),
  );

/** Opens a short rest as the DM through the API (already open is fine): for looking only. */
async function openShortRest(page: Page, campaign: string) {
  const response = await page.request.post(`/api/campaigns/${campaign}/rest?perspective=DM`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    data: { requestId: crypto.randomUUID(), kind: 'short' },
  });
  expect([201, 409]).toContain(response.status());
}

async function callRest(page: Page, kind: 'Short rest (1 hour)' | 'Long rest (8 hours)') {
  await openSheet(page, 'Time and weather');
  await page.locator('#sheet-time').getByRole('button', { name: kind }).click();
}

test('the DM’s short rest lets the player spend a Hit Point Die the server rolls', async ({
  browser,
}) => {
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGNS.short);
  await enterWorld(player, TOKENS.player, CAMPAIGNS.short);
  await callRest(dm, 'Short rest (1 hour)');
  await expect(dm.getByText('The party settles for a short rest.', { exact: false })).toBeVisible();
  await expect(banner(dm)).toContainText('Short rest: the players spend Hit Point Dice.');
  // The player learns of it live, and goes from the banner to the sheet's Hit Point Dice.
  await expect(banner(player)).toContainText('Short rest: spend Hit Point Dice to recover.', {
    timeout: LIVE,
  });
  await banner(player).getByRole('button', { name: 'Spend Hit Point Dice' }).click();
  const dialog = player.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Hit Point Dice' })).toBeVisible();
  const answer = player.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/rest/hit-die'),
  );
  await dialog.getByRole('button', { name: 'Spend a d10' }).click();
  const { healed } = (await (await answer).json()) as { healed: number };
  expect(healed).toBeGreaterThanOrEqual(3);
  await hitPoints(player, 30 + healed, 78);
  await expect(dialog.getByText('6 of 7 left')).toBeVisible();
  // The die flies with its plate.
  await expect(player.locator('.dice-plate')).toContainText('Hit Point Die', { timeout: LIVE });
  // The DM ends the rest; the player can spend no more. The DM's screen reads the rest again while
  // the player's die still flies on it: on a loaded runner that took longer than 15 s once.
  await banner(dm).getByRole('button', { name: 'End the short rest' }).click();
  await expect(banner(dm)).toHaveCount(0, { timeout: LIVE * 2 });
  await expect(dialog.getByRole('button', { name: 'Spend a d10' })).toBeDisabled({ timeout: LIVE });
  await expect(
    dialog.getByText('Hit Point Dice are spent in a short rest the DM calls.'),
  ).toBeVisible();
});

test('a long rest restores Elowen, and the DM takes a level for her by the rules', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, CAMPAIGNS.long);
  await callRest(page, 'Long rest (8 hours)');
  await expect(page.getByText('The party rests eight hours', { exact: false })).toBeVisible();
  await expect(page.locator('#sheet-time')).toContainText('Day 1 · 18:00');
  const card = page.locator('.rail-member').filter({ hasText: 'Elowen Starwhisper' });
  await card.click();
  await page.getByRole('button', { name: 'Full character sheet' }).click();
  const dialog = await openCharacter(page, 'Overview');
  await hitPoints(page, 78, 78);
  await takeWizardLevel(page, dialog);
  await hitPoints(page, 84, 84);
  await expect(page.getByRole('dialog').getByText('Level 16', { exact: true })).toBeVisible();
});

test('a long rest cut short is a short rest; a second one the same day restores no one', async ({
  page,
}) => {
  // docs/adr/0050-the-world-around.md §5–6.
  await enterWorld(page, TOKENS.dm, CAMPAIGNS.cut);
  await openSheet(page, 'Time and weather');
  const time = page.locator('#sheet-time');
  await time.getByText('The long rest was cut short').click();
  await time.getByRole('combobox', { name: 'Hours rested' }).selectOption('3');
  await time.getByRole('button', { name: 'Cut short after 3 h' }).click();
  await expect(
    page.getByText('The long rest is cut short after 3 h', { exact: false }),
  ).toBeVisible();
  await expect(banner(page)).toContainText('Short rest: the players spend Hit Point Dice.');
  await expect(time).toContainText('Day 1 · 13:00');
  await banner(page).getByRole('button', { name: 'End the short rest' }).click();
  await expect(banner(page)).toHaveCount(0);
  // A full long rest now, then another the same day: the second restores no one.
  await time.getByRole('button', { name: 'Long rest (8 hours)' }).click();
  await expect(page.getByText('The party rests eight hours', { exact: false })).toBeVisible();
  await time.getByRole('button', { name: 'Long rest (8 hours)' }).click();
  await expect(
    page.getByText('Elowen Starwhisper had a long rest less than 24 hours ago: nothing restored.', {
      exact: false,
    }),
  ).toBeVisible();
  await expectAccessible(page, 'the DM’s rests with a rest cut short');
});

test('the DM exposes the party to extreme cold, and the history keeps the failed saves', async ({
  page,
}) => {
  // docs/adr/0050-the-world-around.md §8.
  await enterWorld(page, TOKENS.dm, CAMPAIGNS.hazard);
  await openSheet(page, 'Time and weather');
  const hazards = page.locator('#sheet-time').getByRole('region', { name: 'Hazards of the road' });
  await hazards.getByRole('combobox', { name: 'Hazard' }).selectOption('cold');
  await hazards.getByRole('combobox', { name: 'Hours' }).selectOption('2');
  const answer = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/commands') &&
      response.request().method() === 'POST',
  );
  await hazards.getByRole('button', { name: 'Expose the party for 2 h' }).click();
  expect((await (await answer).json()) as { status: string }).toMatchObject({ status: 'accepted' });
  await openSheet(page, 'History');
  await expect(page.getByText(/Extreme cold for 2 h: \d+ saves failed/).first()).toBeVisible();
  await expectAccessible(page, 'the DM history with a hazard');
});

test('the Journal tells the party’s quest as it lived it', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.long);
  await openSheet(page, 'Journal');
  const quest = page.locator('#sheet-journal .quest-card');
  await expect(quest.getByRole('heading', { name: 'The Missing Caravan' })).toBeVisible();
  await expect(quest).toContainText('In progress');
  await expect(quest).toContainText('We learned that the Merchant Guild caravan never arrived.');
});

test('the Russian rest reads only Russian', async ({ page }) => {
  await enterWorld(page, TOKENS.dm, CAMPAIGNS.ru);
  await openSheet(page, 'Время и погода');
  const sheet = page.locator('#sheet-time');
  await sheet.getByRole('button', { name: 'Короткий отдых (1 час)' }).click();
  await expect(banner(page)).toContainText('Короткий отдых: игроки тратят кости хитов.');
  await expect(sheet).toContainText('Идёт короткий отдых');
  const text = await banner(page).innerText();
  expect(text.match(/[A-Za-z]{3,}/g) ?? []).toEqual([]);
});

test('a result in the character sheet never hides the sheet’s last lines', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.notice);
  await openShortRest(page, CAMPAIGNS.notice);
  const dialog = page.getByRole('dialog');
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    if (!(await dialog.isVisible())) {
      await banner(page).getByRole('button', { name: 'Spend Hit Point Dice' }).click();
      await dialog.getByRole('button', { name: 'Spend a d6' }).click();
    }
    await expect(dialog.locator('.hero-notice .outcome')).toBeVisible();
    // Scrolled to its end in whatever scrolls here (the panel, or the whole sheet on a phone).
    const clear = await dialog
      .locator('.feature-list li')
      .last()
      .evaluate((line) => {
        let box = line.parentElement;
        while (
          box &&
          !(box.scrollHeight > box.clientHeight && getComputedStyle(box).overflowY !== 'visible')
        ) {
          box = box.parentElement;
        }
        box?.scrollTo(0, box.scrollHeight);
        const notice = document.querySelector('.hero-notice .outcome')?.getBoundingClientRect();
        return line.getBoundingClientRect().bottom <= (notice?.top ?? Number.POSITIVE_INFINITY);
      });
    expect(clear, `${size.name}: the last line ends above the result`).toBe(true);
  }
});

for (const size of WIDTHS) {
  test(`the rest and Hit Point Dice pass axe at ${size.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await enterWorld(page, TOKENS.player, CAMPAIGNS.axe);
    await openShortRest(page, CAMPAIGNS.axe);
    await expect(banner(page)).toBeVisible();
    await expectAccessible(page, `${size.name} world in a short rest`);
    await banner(page).getByRole('button', { name: 'Spend Hit Point Dice' }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Spend a d10' }),
    ).toBeEnabled();
    await expectAccessible(page, `${size.name} Hit Point Dice`);
  });
}
