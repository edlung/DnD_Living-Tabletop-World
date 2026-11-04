import { expect as baseExpect, test, type Page } from '@playwright/test';

import rulesSeed from '../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  enterCombat,
  expectAccepted,
  submit,
  turnTray,
} from './support/combat.ts';
import { TOKENS } from './support/session.ts';

/**
 * An attack's window at the table (docs/adr/0046-reactions-beyond-counterspell.md §3): a raider's
 * scimitar meets Elowen, who knows Shield; her player sees what the table hears — the total, her
 * AC, the damage — and turns the hit aside. The browser server's combat d20 always shows 11: the
 * raider's 15 hits her AC, set to 14 here, and misses the 19 Shield makes. Raider 1 starts beside
 * her; after her turn comes its own.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const ELOWEN = 'elowen-starwhisper';
const RAIDER_1 = 'creature-10fb59d4';

async function dmCommand(page: Page, campaign: string, commandId: string, command: unknown) {
  const response = await page.request.post(`/api/campaigns/${campaign}/commands`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    data: { commandId: `${campaign}.${commandId}`, command },
  });
  expect(((await response.json()) as { status: string }).status).toBe('accepted');
}

/** Elowen as the seed has her, with Shield among her ranger spells and AC 14 (no armour on). */
function withShield() {
  const seeded = rulesSeed.commands.find(
    (command) => command.type === 'SetCharacterSheet' && command.entityId === ELOWEN,
  );
  if (!seeded || !('sheet' in seeded)) throw new Error('Elowen has no seeded sheet');
  const { sheet } = seeded;
  return {
    ...sheet,
    armorClass: 14,
    spellcasting: sheet.spellcasting.map((source, index) =>
      index === 0 ? { ...source, spells: [...source.spells, 'shield'] } : source,
    ),
  };
}

test('her Shield turns a raider’s hit aside, after she sees what it would do', async ({
  browser,
}) => {
  const campaign = COMBAT_CAMPAIGNS.shield;
  const player = await browser.newPage();
  await enterCombat(player, campaign);
  await dmCommand(player, campaign, 'shield', {
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: withShield(),
  });
  expectAccepted(await submit(player, turnTray(player).getByRole('button', { name: 'End turn' })));
  await dmCommand(player, campaign, 'slash', {
    type: 'Attack',
    combatantId: RAIDER_1,
    attackId: 'scimitar',
    targetId: ELOWEN,
  });
  const prompt = player.getByRole('alertdialog', { name: 'Reaction: you are hit' });
  await expect(prompt).toContainText('(total 15, your AC 14)');
  await expect(prompt).toContainText('It would deal');
  await expectAccessible(player, 'the hit’s question');
  expectAccepted(
    await submit(player, prompt.getByRole('button', { name: 'Shield: +5 AC, it misses' })),
  );
  await expect(prompt).toBeHidden();
  await expect(
    player.getByRole('status').filter({ hasText: 'Shield: the attack misses' }),
  ).toBeVisible();
});
