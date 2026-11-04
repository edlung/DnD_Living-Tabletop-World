import { randomUUID } from 'node:crypto';

import { expect as baseExpect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The DM's library (docs/adr/0058-campaign-content.md §3–4): a letter kept for later, changed and
 * given to the party, which sees it only then; "Road encounters" written on a d6 and rolled by
 * the server — for the DM alone, which the player never sees, then for the table, whose result the
 * player reads in the dice log.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.library;
const RESULTS = ['Wolves', 'A pedlar', 'Bandits'];
/** Names of this run's own: a retry finds the first run's letter and table beside its own. */
const LETTER = `A letter, unsigned ${randomUUID().slice(0, 4)}`;
const ROAD = `Road encounters ${randomUUID().slice(0, 4)}`;
/** A throw on a loaded runner: the engine's load and the landing are bounded, its timers slow. */
const LANDS = { timeout: 30_000 };

test('the DM keeps a letter for later, changes it, and gives it to the party', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();

  await openSheet(dm, 'Party');
  const sheet = dm.locator('#sheet-party');
  const give = sheet.getByRole('region', { name: 'Give a handout' });
  await give.getByLabel('Title', { exact: true }).fill(LETTER);
  await give.getByLabel('Text (optional)', { exact: true }).fill('Meet me at the mill.');
  await give.getByRole('button', { name: 'Keep for later' }).click();
  await expect(give).toContainText('Kept for later: it waits below.');
  const kept = sheet.getByRole('region', { name: 'Kept for later' });
  const letter = kept.getByRole('listitem').filter({ hasText: LETTER });
  await expect(letter).toContainText('Not given yet');
  await expect(player.locator('.asked-check')).toHaveCount(0);

  await letter.getByRole('button', { name: `Change: ${LETTER}` }).click();
  await letter
    .getByLabel('Text (optional)', { exact: true })
    .fill('Meet me at the old mill at dusk.');
  await letter.getByRole('button', { name: 'Save the changes' }).click();
  await expect(letter).toContainText('Meet me at the old mill at dusk.');
  await expectAccessible(dm, 'the kept handouts');

  await letter.getByLabel('For', { exact: true }).selectOption({ label: 'The party' });
  await letter.getByRole('button', { name: `Give: ${LETTER}` }).click();
  await expect(letter).toContainText('Given.');
  await expect(letter).not.toContainText('Not given yet');
  const banner = player.locator('.asked-check', { hasText: LETTER });
  await expect(banner).toContainText(`The DM gave you a handout: ${LETTER}`);
});

test('the DM writes a random table and rolls it, for the DM alone and for the table', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);

  await openSheet(dm, 'Dice');
  const tables = dm.locator('#sheet-dice').getByRole('region', { name: 'Random tables' });
  await tables.getByRole('button', { name: 'Write a table' }).click();
  await tables.getByLabel('Name', { exact: true }).fill(ROAD);
  await tables.getByLabel('Die', { exact: true }).selectOption({ label: 'd6' });
  const lines = tables.getByLabel('Results, one a line');
  // A face no result holds is named.
  await lines.fill('1-2 Wolves\n4-6 Bandits');
  await tables.getByRole('button', { name: 'Save the table' }).click();
  await expect(tables).toContainText('look at 3');
  await expect(lines).toHaveAttribute('aria-invalid', 'true');
  await lines.fill('1-2 Wolves\n3 A pedlar\n4-6 Bandits');
  await tables.getByRole('button', { name: 'Save the table' }).click();
  const road = tables.getByRole('listitem').filter({ hasText: ROAD });
  await expect(road).toContainText('d6, results: 3');
  await road.getByText('Its results').click();
  const first = road.locator('.table-results li').first();
  await expect(first).toContainText('1–2');
  await expect(first).toContainText('Wolves');
  await expectAccessible(dm, 'the random tables');

  await openSheet(player, 'Dice');
  const playerLog = player.locator('#sheet-dice').getByRole('region', { name: 'Recent rolls' });
  const dmLog = dm.locator('#sheet-dice').getByRole('region', { name: 'Recent rolls' });
  await road.getByRole('button', { name: `Roll for me: ${ROAD}` }).click();
  // The log lists a roll once its dice have landed, the table's result on the plate.
  await expect(dm.locator('.dice-plate .dice-table-result')).toBeVisible(LANDS);
  const secret = dmLog.getByRole('listitem').filter({ hasText: `Table: ${ROAD}` });
  await expect(secret).toHaveCount(1, LANDS);
  await expect(secret).toContainText('Hidden');
  expect(RESULTS).toContain((await secret.locator('.dice-table-result').textContent()) ?? '');
  await road.getByRole('button', { name: `Roll for the table: ${ROAD}` }).click();
  await expect(dmLog.getByRole('listitem').filter({ hasText: `Table: ${ROAD}` })).toHaveCount(
    2,
    LANDS,
  );
  const shown = playerLog.getByRole('listitem').filter({ hasText: `Table: ${ROAD}` });
  // Only the roll for the table reaches the player, its result with it.
  await expect(shown).toHaveCount(1, LANDS);
  const said = (await shown.locator('.dice-table-result').textContent()) ?? '';
  expect(RESULTS).toContain(said);
});
