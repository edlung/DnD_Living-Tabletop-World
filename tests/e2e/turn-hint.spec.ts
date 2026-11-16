import { expect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import {
  anchor,
  battlefield,
  clickWhereShown,
  COMBAT_CAMPAIGNS,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { closePages, freshPage } from './support/pages.ts';
import { collectApiBodies, enterWorld, TOKENS } from './support/session.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * "What can I do?" (docs/adr/0073-table-ideas.md §3, Stage 820): on a player's own screen, a list
 * in plain words of what the hero can do now — on her turn what is left of it, as she spends it;
 * on another's turn that she waits, and her reaction; outside a fight, the scene and the places.
 * Everything it says comes from her own reads. Chromium on a laptop and WebKit on an iPad, each
 * on a campaign of its own.
 */
const WAIT = { timeout: 15_000 };

const hintButton = (page: Page) =>
  page.getByRole('button', { name: 'What can I do?', exact: true });
const hint = (page: Page) => page.locator('dialog.hint-dialog');
const line = (page: Page, title: string | RegExp) =>
  hint(page).locator('.hint-line').filter({ has: page.getByRole('heading', { name: title }) });

async function openHint(page: Page): Promise<void> {
  await hintButton(page).click();
  await expect(hint(page)).toBeVisible();
}

async function closeHint(page: Page): Promise<void> {
  await hint(page).getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(hint(page)).toBeHidden();
}

test('on her turn the hint says what is left, as she spends it; then that she waits', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const campaign =
    test.info().project.name === 'ipad' ? COMBAT_CAMPAIGNS.hintIpad : COMBAT_CAMPAIGNS.hint;
  const traffic = collectApiBodies(page);
  await enterCombat(page, campaign);
  await expect(anchor(page)).toContainText('Turn: Elowen Starwhisper', WAIT);

  // A fresh turn: everything is hers to use.
  await openHint(page);
  await expect(hint(page).getByRole('heading', { level: 2 })).toHaveText('It is your turn');
  await expect(line(page, /^Your movement/)).toContainText(
    'Up to 30 ft left. Tap a square on the map to go there.',
  );
  const action = line(page, /^One action/);
  await expect(action).toContainText('You can');
  await expect(action).toContainText('At an enemy: attack, or cast a spell.');
  // Her own options, as the rules list them now, in plain words.
  await expect(action).toContainText('Dodge — be harder to hit until your next turn');
  await expect(action).toContainText('Dash — move once more this turn');
  await expect(line(page, /^A bonus action/)).toContainText('You can');
  await expect(line(page, /^Your reaction is ready/)).toBeVisible();
  await expect(line(page, /^Something else\?/)).toContainText('Say it aloud.');
  await expectAccessible(page, 'the hint on a fresh turn');
  await closeHint(page);
  await expect(hintButton(page)).toBeFocused();

  // She walks three squares: fifteen feet are left.
  await square(page, 5, 6).click();
  expectAccepted(await submit(page, battlefield(page).getByRole('button', { name: 'Move here' })));
  await openHint(page);
  await expect(line(page, /^Your movement/)).toContainText('Up to 15 ft left.', WAIT);
  await closeHint(page);

  // She dodges: the action is spent, and the hint no longer offers it.
  await clickWhereShown(
    page,
    battlefield(page).getByRole('button', { name: /Elowen Starwhisper \(you\)/ }),
  );
  expectAccepted(
    await submit(page, turnTray(page).getByRole('button', { name: 'Dodge', exact: true })),
  );
  await openHint(page);
  const spent = line(page, /^One action/);
  await expect(spent).toContainText('Your action is spent this turn.', WAIT);
  await expect(spent).toContainText('Used up');
  await expect(spent).not.toContainText('Dodge —');
  await expect(line(page, /^Your movement/)).toContainText('Up to 15 ft left.');
  await closeHint(page);

  // Her turn ends: she waits, and her reaction is ready.
  expectAccepted(await submit(page, turnTray(page).getByRole('button', { name: 'End turn' })));
  await expect(anchor(page)).toContainText('Turn: Unidentified creature 1', WAIT);
  await openHint(page);
  await expect(hint(page).getByRole('heading', { level: 2 })).toHaveText(
    'It is Unidentified creature 1’s turn',
  );
  await expect(line(page, /^Wait for your turn/)).toBeVisible();
  await expect(line(page, /^Your reaction is ready/)).toBeVisible();
  await expect(line(page, /^One action/)).toHaveCount(0);
  await expectAccessible(page, 'the hint on another’s turn');
  await closeHint(page);

  // What it read is her own: her sheet and her own options; nothing of a creature's.
  await traffic.assertPlayerBoundary(
    ['"initiative"', '"armorClass"'],
    ['"location-f3b82c8b"'],
    ['/entities/elowen-starwhisper/sheet'],
  );
});

test('outside a fight the hint names the place and leads to Places', async ({ browser }) => {
  test.skip(test.info().project.name !== 'chromium', 'One engine is enough for the scene’s hint.');
  test.setTimeout(90_000);
  const page = await freshPage(browser);
  await enterWorld(page, TOKENS.player, UI_PARTY_CAMPAIGNS.hintScene);
  await expect(hintButton(page)).toBeVisible(WAIT);
  await openHint(page);
  await expect(hint(page).getByRole('heading', { level: 2 })).toHaveText(
    'What you can do at Old Trade Road',
    WAIT,
  );
  await expect(line(page, /^Look around/)).toContainText('Tap a person or a thing on the scene');
  await expect(line(page, /^Something else\?/)).toBeVisible();
  await expectAccessible(page, 'the hint outside a fight');
  await line(page, /^Go somewhere/)
    .getByRole('button', { name: 'Open Places', exact: true })
    .click();
  await expect(hint(page)).toBeHidden();
  await expect(page.locator('#sheet-places')).toBeVisible();

  // The DM has no such button: the hint is a player's.
  const dm = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, UI_PARTY_CAMPAIGNS.hintScene);
  await expect(dm.locator('nav.dock')).toBeVisible(WAIT);
  await expect(hintButton(dm)).toHaveCount(0);
});

test('по-русски: подсказка в свой ход', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'The words are the same on every engine.');
  test.setTimeout(90_000);
  await enterCombat(page, COMBAT_CAMPAIGNS.hintRu);
  await page.getByRole('button', { name: 'Что я могу сделать?', exact: true }).click();
  await expect(hint(page).getByRole('heading', { level: 2 })).toHaveText('Сейчас ваш ход', WAIT);
  await expect(hint(page)).toContainText('Осталось до 30 фт.');
  await expect(hint(page)).toContainText('Одно действие');
  await expect(hint(page)).toContainText('Уклонение — по вам труднее попасть');
  await expect(hint(page)).toContainText('Реакция готова');
  await expectAccessible(page, 'подсказка в свой ход');
  await hint(page).getByRole('button', { name: 'Понятно', exact: true }).click();
});
