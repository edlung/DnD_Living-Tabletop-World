import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The DM's screen (docs/adr/0043-dm-screen.md, Stage 620): the Party sheet shows every
 * character's hit points, Armor Class, conditions and passive scores; the DM deals damage, sets a
 * condition and grants Heroic Inspiration by hand, each with a reason the history keeps; asks the
 * whole table for a check; records a ruling; keeps notes; changes a running fight's turn order;
 * and a reload comes back to the open sheet.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
// One campaign for the three, in order: the last one starts a fight.
test.describe.configure({ mode: 'serial' });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.dmScreen;
const ELOWEN = 'Elowen Starwhisper';

const party = (page: Page) => page.locator('#sheet-party');
const card = (page: Page, name: string) =>
  party(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) });

/** The hit points a card shows (its words for screen readers aside), as [current, max]. */
async function hitPointsOn(cardOf: Locator): Promise<[number, number]> {
  const match = /(\d+)\/(\d+)/.exec(await cardOf.locator('.party-hp').innerText());
  return [Number(match?.[1]), Number(match?.[2])];
}

test('the DM sees the party and changes it by hand, with reasons the history keeps', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await enterWorld(page, TOKENS.dm, CAMPAIGN);
  await openSheet(page, 'Party');
  const elowen = card(page, ELOWEN);
  await expect(party(page).getByRole('listitem')).toHaveCount(4);
  await expect(elowen).toContainText('No conditions');
  await expect(elowen).toContainText(/Passive Perception \d+ · Insight \d+ · Investigation \d+/);
  await expect(elowen.locator('.party-hp')).toContainText(/\d+\/\d+/);
  const [before, max] = await hitPointsOn(elowen);
  await expectAccessible(page, 'the Party sheet');

  // Damage, with a reason: the form asks for one first.
  await elowen.getByRole('button', { name: `Damage or heal: ${ELOWEN}`, exact: true }).click();
  const form = elowen.getByRole('form').or(elowen.locator('form.hand-form')).first();
  await form.getByLabel('Amount', { exact: true }).fill('7');
  await form.getByLabel('Damage type', { exact: true }).selectOption({ label: 'Fire' });
  await form.getByRole('button', { name: 'Deal the damage', exact: true }).click();
  await expect(form.getByText('Say why, in a few words.', { exact: true })).toBeVisible();
  await form
    .getByLabel('Why (kept in your history)', { exact: true })
    .fill('Fell into the brazier');
  await form.getByRole('button', { name: 'Deal the damage', exact: true }).click();
  await expect(elowen.locator('.party-hp')).toContainText(`${String(before - 7)}/${String(max)}`);

  // A condition, then Heroic Inspiration.
  await elowen.getByRole('button', { name: `Condition: ${ELOWEN}`, exact: true }).click();
  await elowen.getByLabel('Condition', { exact: true }).selectOption({ label: 'Prone' });
  await elowen.getByLabel('Why (kept in your history)', { exact: true }).fill('Knocked over');
  await elowen.getByRole('button', { name: 'Apply the condition', exact: true }).click();
  await expect(elowen.locator('.party-conditions')).toHaveText('Prone');
  await elowen.getByRole('button', { name: `Inspiration: ${ELOWEN}`, exact: true }).click();
  await elowen.getByLabel('Why (kept in your history)', { exact: true }).fill('A brave stand');
  await elowen.getByRole('button', { name: 'Grant Heroic Inspiration', exact: true }).click();
  await expect(elowen.getByText('Inspired', { exact: true })).toBeVisible();

  // The whole table is asked for a check at once.
  const ask = party(page).getByRole('region', { name: 'Ask for a check' });
  await ask
    .getByLabel('Character', { exact: true })
    .selectOption({ label: 'Everyone at the table' });
  await ask.getByRole('button', { name: 'Ask', exact: true }).click();
  await openSheet(page, 'Dice');
  await expect(page.locator('#sheet-dice')).toContainText('Maren Ashby');

  // A ruling for the party.
  await openSheet(page, 'Party');
  const ruling = party(page).getByRole('region', { name: 'Record a ruling' });
  await ruling.getByRole('checkbox', { name: ELOWEN, exact: true }).check();
  await ruling
    .getByLabel('What happened', { exact: true })
    .fill('Elowen swung across on the rope.');
  await ruling
    .getByLabel('Why (kept in your history)', { exact: true })
    .fill('Athletics 17 on her dice');
  await ruling.getByRole('button', { name: 'Record the ruling', exact: true }).click();

  // The history keeps each change by hand with its reason.
  await openSheet(page, 'History');
  const history = page.locator('#sheet-history');
  await expect(history).toContainText(
    `${ELOWEN}: 7 damage (Fire), hit points ${String(before)} → ${String(before - 7)}`,
  );
  await expect(history).toContainText('By hand: “Fell into the brazier”');
  await expect(history).toContainText(`${ELOWEN}: now Prone`);
  await expect(history).toContainText(`${ELOWEN}: Heroic Inspiration granted`);
  await expect(history).toContainText('Ruling: Elowen swung across on the rope.');
});

test('the DM keeps notes, and a reload comes back to the open sheet', async ({ page }) => {
  await enterWorld(page, TOKENS.dm, CAMPAIGN);
  await openSheet(page, 'Notes');
  const notes = page.locator('#sheet-notes');
  await notes.getByRole('button', { name: 'New note', exact: true }).click();
  await notes.getByLabel('Title', { exact: true }).fill('Mira lies');
  await notes.getByLabel('Note', { exact: true }).fill('About the road north.');
  await notes.getByRole('button', { name: 'Save the note', exact: true }).click();
  await expect(notes.getByRole('listitem').filter({ hasText: 'Mira lies' })).toContainText(
    'About the road north.',
  );
  await expectAccessible(page, 'the Notes sheet');
  // The personas' token lives in memory only: after a reload the DM enters again, and the tab
  // remembers the sheet that was open.
  await page.reload();
  await enterWorld(page, TOKENS.dm, CAMPAIGN);
  await expect(page.locator('#sheet-notes')).toBeVisible();
  await expect(page.locator('#sheet-notes')).toContainText('Mira lies');
  await page
    .locator('#sheet-notes')
    .getByRole('button', { name: 'Delete: Mira lies', exact: true })
    .click();
  await expect(page.locator('#sheet-notes')).toContainText('No notes yet.');
});

test('the DM changes a running fight’s turn order', async ({ page }) => {
  test.setTimeout(120_000);
  await enterWorld(page, TOKENS.dm, CAMPAIGN);
  await openSheet(page, 'Encounter');
  const sheet = page.locator('#sheet-encounter');
  await sheet
    .getByRole('button', { name: 'Start: Ambush on the Old Trade Road', exact: true })
    .click();
  const tools = sheet.getByRole('region', { name: 'Turn order' });
  await expect(tools.getByRole('listitem').first()).toBeVisible();
  const rows = tools.locator('ol.turn-order > li');
  await expect(rows).toHaveCount(15);
  // The one whose turn it is waits until after the next combatant.
  const current = rows.filter({ hasText: 'Now' });
  const name = (await current.locator('.turn-order-name').innerText()).replace('Now', '').trim();
  await current.getByRole('button', { name: 'Delay the turn', exact: true }).click();
  await current.getByRole('button', { name: 'Delay the turn', exact: true }).last().click();
  await expect(rows.filter({ hasText: 'Now' })).not.toContainText(name);
  // A combatant leaves the fight, with a reason.
  const last = rows.last();
  const leaving = (await last.locator('.turn-order-name').innerText()).trim();
  await last.getByRole('button', { name: `Take ${leaving} out of the fight`, exact: true }).click();
  await last.getByLabel('Why (kept in your history)', { exact: true }).fill('Fled into the trees');
  await last.getByRole('button', { name: 'Take out of the fight', exact: true }).click();
  await expect(rows).toHaveCount(14);
  await expectAccessible(page, 'the turn order tools');
});
