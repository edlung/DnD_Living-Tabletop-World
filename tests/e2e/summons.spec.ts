import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_SUMMON_CAMPAIGNS } from '../../apps/server/src/testing/ui-summon-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import {
  clickSquare,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';

/**
 * The summons (docs/adr/0056-characters-from-the-srd.md §5): in the road ambush Elowen calls up a
 * giant spider with a 4th-level slot; it stands beside her and its turn comes right after hers,
 * hers to command — its Web Bolt at a raider she picks. Outside a fight she calls up a fey steed,
 * which waits beside her in the scene; a Russian table reads the same in Russian.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('Elowen calls up a giant spider in a fight and runs its turn', async ({ page }) => {
  test.setTimeout(120_000);
  await enterCombat(page, UI_SUMMON_CAMPAIGNS.fight);
  await clickSquare(page, 2, 6);
  await turnTray(page).getByRole('button', { name: 'Cast Giant Insect beside you' }).click();
  const choice = turnTray(page).getByRole('group', { name: 'Giant Insect: which slot?' });
  await choice.getByLabel('The insect’s form', { exact: true }).selectOption({ label: 'Spider' });
  await expectAccessible(page, 'what a summoning spell calls up');
  expectAccepted(await submit(page, choice.getByRole('button', { name: 'Level 4 slot' })));
  await expect(
    page.getByText('Giant Insect: Giant Insect (Spider) appears at your call.').first(),
  ).toBeVisible();
  await expect(square(page, 3, 5)).toHaveAccessibleName(/Giant Insect \(Spider\)/);

  expectAccepted(
    await submit(page, turnTray(page).getByRole('button', { name: 'End turn', exact: true })),
  );
  const card = page.locator('.commanded-turn');
  await expect(card).toContainText('Giant Insect (Spider)’s turn: you command it.');
  await card.getByLabel('Which attack', { exact: true }).selectOption({ label: 'Web Bolt' });
  await expectAccessible(page, 'a summoned creature’s turn');
  expectAccepted(await submit(page, card.getByRole('button', { name: /^Web Bolt at / })));
  expectAccepted(await submit(page, card.getByRole('button', { name: 'End its turn' })));
  await expect(card).toHaveCount(0);
});

interface Words {
  readonly elowen: RegExp;
  readonly actions: string;
  readonly cast: string;
  readonly type: string;
  readonly fey: string;
  readonly slot: string;
  readonly done: string;
  readonly steed: RegExp;
}

async function callTheSteed(page: Page, campaign: string, words: Words) {
  await enterWorld(page, TOKENS.player, campaign);
  await page
    .getByRole('region', { name: /^(Scene|Сцена)$/ })
    .getByRole('button', { name: words.elowen })
    .first()
    .click();
  const actions = page.getByRole('region', { name: words.actions });
  await actions.getByRole('button', { name: words.cast, exact: true }).click();
  const group = actions.locator('.summon-cast');
  await group.getByLabel(words.type, { exact: true }).selectOption({ label: words.fey });
  await expectAccessible(page, 'a summoning spell outside a fight');
  await group.getByRole('button', { name: words.slot, exact: true }).click();
  await expect(page.getByText(words.done).first()).toBeVisible();
  await expect(page.getByRole('region', { name: /^(Scene|Сцена)$/ })).toContainText(words.steed);
}

test('outside a fight Elowen calls up a fey steed, which waits beside her', async ({ page }) => {
  test.setTimeout(120_000);
  await callTheSteed(page, UI_SUMMON_CAMPAIGNS.scene, {
    elowen: /^Elowen Starwhisper/,
    actions: 'Contextual actions',
    cast: 'Cast Find Steed',
    type: 'The steed’s creature type',
    fey: 'Fey',
    slot: 'Level 4 slot',
    done: 'Find Steed: Otherworldly Steed (Fey) appears at your call.',
    steed: /Otherworldly Steed \(Fey\)/,
  });
});

test('a Russian table calls the steed in Russian', async ({ page }) => {
  test.setTimeout(120_000);
  await callTheSteed(page, UI_SUMMON_CAMPAIGNS.sceneRu, {
    elowen: /^Эловен/,
    actions: 'Действия',
    cast: 'Заклинание: Поиск скакуна',
    type: 'Тип существа скакуна',
    fey: 'Фея',
    slot: 'Ячейка 2 уровня',
    done: 'Поиск скакуна: на зов является Потусторонний скакун (Фея).',
    steed: /Потусторонний скакун \(Фея\)/,
  });
});
