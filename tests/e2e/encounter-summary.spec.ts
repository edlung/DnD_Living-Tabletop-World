import { expect, test } from '@playwright/test';

import { collectApiBodies, enterWorld, expectPlayerBoundary, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

const COMBAT_CAMPAIGN = 'ui-combat';

// The browser response is inspected at the wire boundary. Production contract
// types are owned by the client package, not a dependency of this test runner.
interface EncounterPayload {
  encounter: {
    combatants: readonly Record<string, unknown>[];
    reactionWindow: { choices: readonly string[]; trigger: Record<string, unknown> } | null;
  } | null;
}

test('player reads a real paused encounter and their reaction choices without DM spell or monster stats', async ({
  page,
}) => {
  const traffic = collectApiBodies(page);
  // Read the body as soon as the first encounter response arrives: Chromium may drop a response
  // body it has already delivered once later reads of the same view (live refreshes) follow.
  const encounterPayload = page
    .waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/campaigns/${COMBAT_CAMPAIGN}/encounter`,
    )
    .then(async (response) => (await response.json()) as EncounterPayload);
  await enterWorld(page, TOKENS.player, COMBAT_CAMPAIGN);
  // The summary in words is the Journal's; the stage shows the battlefield.
  await expect(page.getByRole('region', { name: 'Battlefield', exact: true })).toBeVisible();
  await openSheet(page, 'Journal');
  const encounter = page.getByRole('region', { name: 'Encounter summary', exact: true });
  const reaction = encounter.getByRole('region', { name: 'Reaction window', exact: true });
  await expect(reaction.getByRole('status')).toHaveText(
    'Spell resolution is waiting for reactions.',
  );
  await expect(reaction).toContainText('Counterspell, Ignore');
  await expect(reaction).toContainText('Elowen Starwhisper: Pending');
  await encounter.getByText('Combatants and turn order', { exact: true }).click();
  await expect(encounter).toContainText('78 / 78');
  const shaman = encounter.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Unidentified creature 4', exact: true }),
  });
  await expect(shaman).toBeVisible();
  await expect(shaman).not.toContainText('Hit points');
  await expect(shaman).not.toContainText('Initiative');
  const payload = await encounterPayload;
  expect(payload.encounter?.combatants).toHaveLength(5);
  expect(payload.encounter?.reactionWindow?.choices).toEqual(['counterspell', 'ignore']);
  expect(payload.encounter?.reactionWindow?.trigger).not.toHaveProperty('spellId');
  const monsters =
    payload.encounter?.combatants.filter((combatant) => combatant['side'] === 'hostile') ?? [];
  expect(monsters).toHaveLength(4);
  for (const monster of monsters) {
    expect(monster).not.toHaveProperty('hitPoints');
    expect(monster).not.toHaveProperty('initiative');
  }
  await expectPlayerBoundary(page);
  expect(await page.content()).not.toContain('ashen-bolt');
  // On the Old Trade Road the player perceives its child site by ID alone (name null).
  await traffic.assertPlayerBoundary(
    ['ashen-bolt', '"spellId"', '"initiative"', '"armorClass"'],
    ['"abandoned-caravan-site"'],
  );
});

test('DM summary exposes authorized spell and stats, then clears them for character and public previews', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, COMBAT_CAMPAIGN);
  await openSheet(page, 'Journal');
  const encounter = page.getByRole('region', { name: 'Encounter summary', exact: true });
  await expect(encounter.getByRole('region', { name: 'Reaction window' })).toContainText(
    'Ashen Bolt',
  );
  await encounter.getByText('Combatants and turn order', { exact: true }).click();
  const shaman = encounter.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Goblin Shaman', exact: true }),
  });
  await expect(shaman).toContainText('21 / 21');
  await expect(shaman).toContainText('13 (roll 11, modifier 2)');
  await page
    .getByLabel('Perspective', { exact: true })
    .selectOption('CHARACTER:elowen-starwhisper');
  await openSheet(page, 'Journal');
  await expect(encounter.getByRole('region', { name: 'Reaction window' })).toContainText(
    'Counterspell, Ignore',
  );
  await expectPlayerBoundary(page);
  await expect(encounter).not.toContainText('21 / 21');
  await page.getByLabel('Perspective', { exact: true }).selectOption('PUBLIC');
  await openSheet(page, 'Journal');
  await expect(
    page.getByText('No active encounter is visible in this perspective.', { exact: true }),
  ).toBeVisible();
  await expect(encounter).toHaveCount(0);
  await expectPlayerBoundary(page);
});
