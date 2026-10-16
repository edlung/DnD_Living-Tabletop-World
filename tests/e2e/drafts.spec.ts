import { expect, test, type Page } from '@playwright/test';

import campaigns from './fixtures/dm-tool-campaigns.json' with { type: 'json' };
import { expectAccepted, submit } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, closeSheet, openSheet } from './support/shell.ts';

/**
 * Drafts survive (docs/STAGE_320_DESIGN.md §5.1, ADR 0033): Escape in a field that holds a
 * draft closes nothing, and the last selection's panel stays mounted while closed — through
 * the viewer's own actions too — so what was typed is still there when it opens again.
 */
const details = (page: Page) => page.getByRole('complementary', { name: 'Entity details' });

test('Escape in a field with a draft keeps the panel, and a closed panel keeps the draft', async ({
  page,
}) => {
  // Read-only: nothing is submitted.
  await enterWorld(page);
  const mira = page.getByRole('button', { name: 'Mira Vale', exact: true });
  await mira.click();
  await details(page).getByText('Form a hypothesis', { exact: true }).click();
  const hypothesis = page.getByLabel('Hypothesis', { exact: true });
  await hypothesis.fill('Mira knows more than she says.');
  await hypothesis.press('Escape');
  await expect(details(page)).toBeVisible();
  await expect(hypothesis).toBeFocused();
  await expect(hypothesis).toHaveValue('Mira knows more than she says.');

  // Closed with its button and chosen again, the panel still holds the draft.
  await details(page).getByRole('button', { name: 'Close details', exact: true }).click();
  await expect(details(page)).toBeHidden();
  await mira.click();
  await expect(details(page)).toBeVisible();
  await expect(hypothesis).toHaveValue('Mira knows more than she says.');

  // An empty field holds nothing: there Escape closes the panel as anywhere else.
  await hypothesis.fill('');
  await hypothesis.press('Escape');
  await expect(details(page)).toBeHidden();
  await expect(mira).toBeFocused();
});

test('the DM’s line for an NPC survives Escape, closing the panel and the DM’s own action', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, campaigns.drafts);
  await chooseLocation(page, 'market-square');
  const mira = page.getByRole('button', { name: 'Mira Vale', exact: true });
  await mira.click();
  await details(page).getByText('Perform Mira Vale (DM)', { exact: true }).click();
  const line = page.getByLabel('What the character says (optional)');
  await line.fill('Good morning, traveller.');
  await page.getByLabel('Ask about', { exact: true }).selectOption('guild-caravan');
  await line.press('Escape');
  await expect(details(page)).toBeVisible();
  await details(page).getByRole('button', { name: 'Close details', exact: true }).click();

  // The DM's own action re-reads the world; the closed panel keeps its draft and choice.
  await openSheet(page, 'Time and weather');
  await page.getByLabel('Weather at Market Square').selectOption('fog');
  expectAccepted(await submit(page, page.getByRole('button', { name: 'Set weather' })));
  await expect(page.getByLabel('Scene conditions')).toContainText('fog');
  await closeSheet(page, 'Time and weather');
  await mira.click();
  await expect(line).toHaveValue('Good morning, traveller.');
  await expect(page.getByLabel('Ask about', { exact: true })).toHaveValue('guild-caravan');
});
