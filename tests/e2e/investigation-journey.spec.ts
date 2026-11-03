import { expect as baseExpect, test } from '@playwright/test';

import {
  commandAction,
  enterInvestigation,
  entityDetails,
  investigationBoundary,
  INVESTIGATION_CAMPAIGNS,
  playerKnowledge,
  travelTo,
} from './support/investigation.ts';

/**
 * After each action the panels re-read in the background; a hosted runner is several times slower
 * than a laptop, so what an action shows gets the time it needs there (tests/e2e/AGENTS.md).
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('objects lead from Mira to evidence, a hypothesis, contradictory testimony, and Orin recall', async ({
  page,
}) => {
  // The whole investigation in one journey: about 30 s alone on a laptop, more beside other runs.
  test.setTimeout(90_000);
  const campaign = INVESTIGATION_CAMPAIGNS.journey;
  const privacy = investigationBoundary(page);
  await enterInvestigation(page, campaign);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await commandAction(page, 'Ask about Merchant Guild caravan');
  await expect(entityDetails(page)).toContainText('before dawn');

  await travelTo(page, 'Old Trade Road');
  await expect(
    page.getByRole('button', { name: 'Explore Unidentified location', exact: true }),
  ).toBeVisible();
  expect(await page.content()).not.toContain('Abandoned Caravan Site');
  await travelTo(page, 'Unidentified location');
  await commandAction(page, 'Inspect');
  await expect(entityDetails(page)).toContainText('Abandoned Caravan Site');

  const scene = page.getByRole('region', { name: 'Scene', exact: true });
  // The scene lists what it holds by ID; the IDs are opaque (ADR 0008, Gate 06), so the wheel is
  // simply the last of the three unidentified items. The site's result stays clear of the row
  // (scene-result-layout.spec.ts): the player clicks with it still showing.
  await scene.getByRole('button', { name: 'Unidentified item', exact: true }).last().click();
  await commandAction(page, 'Inspect');
  await expect(
    entityDetails(page).getByRole('heading', { name: 'Broken Wagon Wheel', exact: true }),
  ).toBeVisible();
  await commandAction(page, 'Investigate');
  await expect(entityDetails(page)).toContainText(
    'The spokes were sawn through cleanly, not smashed.',
  );

  const hypothesis = 'Someone prepared this wheel before the attack.';
  await entityDetails(page).getByText('Form a hypothesis', { exact: true }).click();
  await page.getByLabel('Hypothesis', { exact: true }).fill(hypothesis);
  await page.getByLabel('Share with', { exact: true }).selectOption({ label: 'Party' });
  await commandAction(page, 'Record hypothesis');
  await expect(entityDetails(page)).toContainText(hypothesis);
  await expect(entityDetails(page)).toContainText('HYPOTHESIS');
  const recorded = (await playerKnowledge(page, campaign)).filter(
    (record) => record.statement === hypothesis,
  );
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.knowledgeType).toBe('HYPOTHESIS');

  await scene.getByRole('button', { name: 'Unidentified feature', exact: true }).first().click();
  await commandAction(page, 'Inspect');
  await expect(
    entityDetails(page).getByRole('heading', { name: 'Strange Symbol', exact: true }),
  ).toBeVisible();
  await expect(entityDetails(page)).toContainText('A strange symbol is burned into a wagon plank.');

  await travelTo(page, 'North Gate');
  await page.getByRole('button', { name: 'Captain Thorne', exact: true }).click();
  await commandAction(page, 'Ask about Merchant Guild caravan');
  const knowledge = await playerKnowledge(page, campaign);
  expect(knowledge.some((record) => record.knowledgeType === 'CONTRADICTION')).toBe(true);
  await page
    .getByRole('button', { name: 'Explore Merchant Guild caravan', exact: true })
    .first()
    .click();
  await expect(entityDetails(page)).toContainText('CONTRADICTION');
  await expect(entityDetails(page)).toContainText('HYPOTHESIS');
  expect(
    knowledge.find((record) => record.statement === 'Goblins attacked the caravan.')?.knowledgeType,
  ).toBe('HYPOTHESIS');

  await travelTo(page, "Orin's Alchemy");
  await page.getByRole('button', { name: 'Orin Stonebeard', exact: true }).click();
  // Evidence is shown deliberately, never one click among the primary actions.
  const actions = entityDetails(page).getByRole('region', { name: 'Contextual actions' });
  await expect(actions.getByText('More conversation options', { exact: true })).toBeVisible();
  await expect(
    actions.locator('.context-buttons').getByRole('button', { name: /^Show evidence/ }),
  ).toHaveCount(0);
  await entityDetails(page).getByText('More conversation options', { exact: true }).click();
  await entityDetails(page).getByText('Show evidence', { exact: true }).click();
  // The evidence the world suggests for Orin is chosen already; another can still be picked.
  await expect(page.getByLabel('Evidence to show', { exact: true })).not.toHaveValue('');
  await page
    .getByLabel('Evidence to show', { exact: true })
    .selectOption({ label: 'A strange symbol is burned into a wagon plank.' });
  await commandAction(page, 'Show selected evidence');
  await commandAction(page, 'Ask about Strange Symbol');
  await expect(entityDetails(page)).toContainText('recognized the same symbol');
  await entityDetails(page).getByRole('button', { name: 'Recall memories', exact: true }).click();
  const memories = page.getByRole('region', { name: 'Recalled memories', exact: true });
  await expect(memories).toBeVisible();
  await expect(memories).toContainText('Orin');
  await expect(memories).not.toContainText('A frightened traveller');
  await privacy.assertClean();
});

test('Mira caravan action appears only after the player learns the concept through an authorized subject', async ({
  page,
}) => {
  const privacy = investigationBoundary(page);
  await enterInvestigation(page, INVESTIGATION_CAMPAIGNS.unknownConcept);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await expect(
    entityDetails(page).getByRole('button', {
      name: 'Ask about Merchant Guild caravan',
      exact: true,
    }),
  ).toHaveCount(0);
  await entityDetails(page).getByText('More conversation options', { exact: true }).click();
  await page
    .getByLabel('Conversation subject', { exact: true })
    .selectOption('merchant-guild-faction');
  await commandAction(page, 'Ask selected subject');
  await expect(
    entityDetails(page).getByRole('button', {
      name: 'Ask about Merchant Guild caravan',
      exact: true,
    }),
  ).toBeVisible();
  await commandAction(page, 'Ask about Merchant Guild caravan');
  await expect(entityDetails(page)).toContainText('before dawn');
  await privacy.assertClean();
});
