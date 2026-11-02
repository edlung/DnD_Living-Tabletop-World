import { expect, test, type Page } from '@playwright/test';

import type { RollEntry } from '../../packages/contracts/src/index.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * Heroic Inspiration on a table check (docs/adr/0046-reactions-beyond-counterspell.md §6): the DM
 * gives Elowen inspiration; her player rolls a check, rolls its d20 again from the log, and the log
 * keeps the first, marked as no longer counting, under the new one. The inspiration is spent, so
 * the offer goes.
 */
const CAMPAIGN = 'ui-dice-reroll';
/** How long a throw may take to land: a hosted runner's software WebGL is slow (Stage 540). */
const LANDS = 15_000;

/** The roll the server answered with, for the button press `press` makes. */
async function rolled(page: Page, ending: string, press: () => Promise<void>): Promise<RollEntry> {
  const response = page.waitForResponse(
    (answer) =>
      new URL(answer.url()).pathname.endsWith(ending) && answer.request().method() === 'POST',
  );
  await press();
  return ((await (await response).json()) as { roll: RollEntry }).roll;
}

test('a player rolls her check again with Heroic Inspiration', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGN);
  const inspired = await page.request.post(`/api/campaigns/${CAMPAIGN}/commands`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    data: {
      commandId: `${CAMPAIGN}.inspire`,
      command: {
        type: 'SetInspiration',
        characterId: 'elowen-starwhisper',
        inspired: true,
        reason: 'A fine plan',
      },
    },
  });
  expect(((await inspired.json()) as { status: string }).status).toBe('accepted');
  await openSheet(page, 'Dice');
  const sheet = page.locator('#sheet-dice');
  const first = await rolled(page, '/rolls', () =>
    sheet.getByRole('button', { name: 'Roll the check' }).click(),
  );
  const log = sheet.getByRole('region', { name: 'Recent rolls' });
  const offer = log.getByRole('group', { name: /^Heroic Inspiration: roll the d20 again/ });
  await expect(offer).toBeVisible({ timeout: LANDS });
  await expectAccessible(page, 'the reroll offer');
  const again = await rolled(page, '/reroll', () =>
    offer.getByRole('button', { name: 'Roll again' }).click(),
  );
  expect(again.rerollOf).toBe(first.rollId);
  expect(again.groups[0]?.modifier).toBe(first.groups[0]?.modifier);
  await expect(offer).toBeHidden();
  const entries = log.locator('.dice-log-entry');
  await expect(entries.first()).toContainText('Heroic Inspiration reroll', { timeout: LANDS });
  await expect(entries.nth(1)).toContainText('rolled again, does not count');
});
