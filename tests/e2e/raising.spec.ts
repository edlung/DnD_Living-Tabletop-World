import { expect as baseExpect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The spells that return the dead (docs/adr/0056-characters-from-the-srd.md §5): the DM's blow
 * kills Tamsin Quickfoot in Market Square; Elowen, who knows Revivify, chooses her in the scene,
 * where only the spells that return the dead are offered on her, and casts it outside any fight;
 * Tamsin lives again with 1 hit point. A Russian table reads the same in Russian.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const TAMSIN = 'Tamsin Quickfoot';

interface HandWords {
  readonly party: string;
  readonly damage: RegExp;
  readonly amount: string;
  readonly type: string;
  readonly slashing: string;
  readonly why: string;
  readonly deal: string;
}

async function killTamsin(dm: Page, words: HandWords) {
  await openSheet(dm, words.party);
  const card = dm.locator('.party-list > li').filter({ hasText: /Tamsin|Тамсин/ });
  await card.getByRole('button', { name: words.damage }).click();
  const form = card.locator('form.hand-form').first();
  await form.getByLabel(words.amount, { exact: true }).fill('999');
  await form.getByLabel(words.type, { exact: true }).selectOption({ label: words.slashing });
  await form.getByLabel(words.why, { exact: true }).fill('A killing blow');
  await form.getByRole('button', { name: words.deal, exact: true }).click();
  // The card reads its label first ("Hit points0/108").
  await expect(card.locator('.party-hp')).toContainText(/\D0\//);
}

test('Elowen casts Revivify on Tamsin, dead a moment ago, outside a fight', async ({ browser }) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, 'ui-raising');
  await killTamsin(dm, {
    party: 'Party',
    damage: /^Damage or heal: Tamsin/,
    amount: 'Amount',
    type: 'Damage type',
    slashing: 'Slashing',
    why: 'Why (kept in your history)',
    deal: 'Deal the damage',
  });

  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, 'ui-raising');
  await player
    .getByRole('region', { name: 'Scene' })
    .getByRole('button', { name: TAMSIN, exact: true })
    .click();
  const actions = player.getByRole('region', { name: 'Contextual actions' });
  // On the dead only the spells that return the dead: Cure Wounds is not offered.
  await expect(actions.getByRole('button', { name: 'Cast Revivify' })).toBeEnabled();
  await expect(actions.getByRole('button', { name: 'Cast Raise Dead' })).toBeEnabled();
  await expect(actions.getByRole('button', { name: 'Cast Cure Wounds' })).toHaveCount(0);
  await expectAccessible(player, 'the spells that return the dead');
  await actions.getByRole('button', { name: 'Cast Revivify' }).click();
  await expect(player.getByText('Revivify returns the dead to life.').first()).toBeVisible();

  const card = dm.locator('.party-list > li').filter({ hasText: TAMSIN });
  await expect(card.locator('.party-hp')).toContainText(/\D1\//);
});

test('a Russian table offers the spells that return the dead in Russian', async ({ browser }) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, 'ui-raising-ru');
  await killTamsin(dm, {
    party: 'Отряд',
    damage: /^Урон или лечение: Тамсин/,
    amount: 'Сколько',
    type: 'Тип урона',
    slashing: 'Рубящий',
    why: 'Почему (останется в вашей истории)',
    deal: 'Нанести урон',
  });
  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, 'ui-raising-ru');
  await player
    .getByRole('region', { name: 'Сцена' })
    .getByRole('button', { name: 'Тамсин Квикфут', exact: true })
    .click();
  const actions = player.getByRole('region', { name: 'Действия' });
  // The SRD's names in the campaign's language: Revivify is «Возрождение».
  const revivify = actions.getByRole('button', { name: 'Заклинание: Возрождение', exact: true });
  await expect(revivify).toBeEnabled();
  await expectAccessible(player, 'the spells that return the dead in Russian');
  await revivify.click();
  await expect(player.getByText('Возрождение возвращает мёртвых к жизни.').first()).toBeVisible();
});
