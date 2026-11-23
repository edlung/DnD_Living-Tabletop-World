import { expect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { expectOnTop, openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * A short way to a pause in Russian (docs/adr/0073-table-ideas.md §2, Stage 810): the player's
 * button and line, the DM's card and "Не сейчас". And on a phone: the DM's card stays over an
 * open sheet — a request for a pause is told nowhere else. The table of two players and a screen
 * is `pause.spec.ts`'s.
 */
const WAIT = { timeout: 15_000 };

test('по-русски: игрок просит паузу, мастер отвечает', async ({ browser }) => {
  test.setTimeout(120_000);
  const campaign = UI_PARTY_CAMPAIGNS.pauseRu;
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await expect(dm.locator('nav.book-parts')).toBeVisible(WAIT);
  const ask = player.getByRole('button', { name: 'Попросить паузу', exact: true });
  await expect(ask).toBeVisible(WAIT);
  await ask.click();
  await expect(player.locator('.pause-asked')).toHaveText(
    'Просьбу о паузе увидит только мастер.',
    WAIT,
  );
  const card = dm.locator('.pause-card');
  await expect(card).toContainText('просит паузу. Это видите только вы.', WAIT);
  await expectAccessible(dm, 'экран мастера с просьбой о паузе');
  await card.getByRole('button', { name: 'Не сейчас', exact: true }).click();
  await expect(card).toHaveCount(0, WAIT);
  await expect(player.locator('.pause-asked')).toHaveText(
    'Мастер увидел, что вы попросили паузу. Через минуту можно попросить ещё раз.',
    WAIT,
  );
  await expectAccessible(player, 'экран игрока после ответа мастера');
});

test('on a phone the DM’s card stays over an open sheet', async ({ browser }) => {
  test.setTimeout(120_000);
  const campaign = UI_PARTY_CAMPAIGNS.pausePhone;
  const dm = await freshPage(browser, { viewport: { width: 390, height: 844 } });
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await openSheet(dm, 'Session');
  await player.getByRole('button', { name: 'Ask for a pause', exact: true }).click();
  const card = dm.locator('.pause-card');
  await expect(card).toBeVisible(WAIT);
  const pause = card.getByRole('button', { name: 'Pause the game', exact: true });
  await expectOnTop(pause);
  await expectAccessible(dm, 'a request for a pause over an open sheet, on a phone');
  await pause.click();
  await expect(card).toHaveCount(0, WAIT);
  await expect(dm.locator('.pause-said')).toHaveText('The game is paused. Resume it in Session.');
  await expect(dm.locator('.pause-said')).toBeFocused();
});
