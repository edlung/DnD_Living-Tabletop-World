import { expect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * A short way to a pause in Russian (docs/adr/0073-table-ideas.md §2, Stage 810): the player's
 * button and line, the DM's card and "Не сейчас". The table of two players and a screen is
 * `pause.spec.ts`'s.
 */
const WAIT = { timeout: 15_000 };

test('по-русски: игрок просит паузу, мастер отвечает', async ({ browser }) => {
  test.setTimeout(120_000);
  const campaign = UI_PARTY_CAMPAIGNS.pauseRu;
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await expect(dm.locator('nav.dock')).toBeVisible(WAIT);
  const ask = player.getByRole('button', { name: 'Попросить паузу', exact: true });
  await expect(ask).toBeVisible(WAIT);
  await ask.click();
  await expect(player.locator('.pause-asked')).toHaveText(
    'О том, что вам нужна пауза, узнал только мастер.',
    WAIT,
  );
  const card = dm.locator('.pause-card');
  await expect(card).toContainText('просит паузу. Это видите только вы.', WAIT);
  await expectAccessible(dm, 'экран мастера с просьбой о паузе');
  await card.getByRole('button', { name: 'Не сейчас', exact: true }).click();
  await expect(card).toHaveCount(0, WAIT);
  await expect(player.locator('.pause-asked')).toHaveText(
    'Мастер увидел, что вы попросили паузу.',
    WAIT,
  );
  await expectAccessible(player, 'экран игрока после ответа мастера');
});
