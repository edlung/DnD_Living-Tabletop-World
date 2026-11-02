import { expect as baseExpect, test, type Page } from '@playwright/test';

import rulesSeed from '../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  clickWhereShown,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { TOKENS } from './support/session.ts';

/**
 * The weapons at the table (docs/adr/0047-weapons.md): a warhammer's Push asks how far before the
 * swing; a scimitar's hit lets the other hand's shortsword follow; an archer with a foe beside her
 * sees the Disadvantage before she shoots. Elowen is remade a fighter of level 5 (Strength 16):
 * the browser server's d20 shows 11, so she hits the Raiders' AC 15 with 17. Raider 1 starts beside
 * her at (3,6), with 10 HP.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const ELOWEN = 'elowen-starwhisper';

async function armElowen(page: Page, campaign: string, weapons: readonly string[]) {
  const seeded = rulesSeed.commands.find(
    (command) => command.type === 'SetCharacterSheet' && command.entityId === ELOWEN,
  );
  if (!seeded || !('sheet' in seeded)) throw new Error('Elowen has no seeded sheet');
  const response = await page.request.post(`/api/campaigns/${campaign}/commands`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    data: {
      commandId: `${campaign}.fighter`,
      command: {
        type: 'SetCharacterSheet',
        entityId: ELOWEN,
        sheet: {
          ...seeded.sheet,
          classes: [{ classId: 'fighter', level: 5 }],
          abilities: { ...seeded.sheet.abilities, str: 16, dex: 14 },
          weapons,
        },
      },
    },
  });
  expect(((await response.json()) as { status: string }).status).toBe('accepted');
}

test('a warhammer’s Push asks how far before the swing, and the raider is pushed', async ({
  browser,
}) => {
  const campaign = COMBAT_CAMPAIGNS.weapons;
  const player = await browser.newPage();
  await enterCombat(player, campaign);
  await armElowen(player, campaign, ['warhammer', 'longbow']);

  // Raider 2, far away, with Raider 1 beside her: the bow's shot would have Disadvantage.
  await clickWhereShown(player, square(player, 10, 7));
  await expect(player.getByText('with disadvantage').first()).toBeVisible();

  await clickWhereShown(player, square(player, 3, 6));
  const tray = turnTray(player);
  await tray.getByRole('button', { name: /with Warhammer$/ }).click();
  const choice = tray.getByRole('group', { name: 'On a hit' });
  await expect(choice).toContainText('Push: a hit pushes a creature up to 10 ft');
  await expectAccessible(player, 'the push choice');
  expectAccepted(await submit(player, choice.getByRole('button', { name: 'Push 10 ft' })));
  await expect(
    player.getByRole('status').filter({ hasText: 'Push: it is pushed 10 ft.' }),
  ).toBeVisible();
  // The raider, unnamed to her, now stands two squares on.
  await expect(square(player, 5, 6)).toHaveAccessibleName(/Unidentified creature 1/);
});

test('after the scimitar, the other hand’s shortsword follows with the Bonus Action', async ({
  browser,
}) => {
  const campaign = COMBAT_CAMPAIGNS.offhand;
  const player = await browser.newPage();
  await enterCombat(player, campaign);
  await armElowen(player, campaign, ['scimitar', 'shortsword']);

  await clickWhereShown(player, square(player, 3, 6));
  const tray = turnTray(player);
  expectAccepted(await submit(player, tray.getByRole('button', { name: /with Scimitar$/ })));
  // The raider chosen again: the other hand's attack is on offer now.
  await clickWhereShown(player, square(player, 3, 6));
  const other = tray.getByRole('button', { name: /^Other hand: Shortsword at/ });
  await expect(other).toBeEnabled();
  await expectAccessible(player, 'the other hand’s attack');
  expectAccepted(await submit(player, other));
  await expect(player.getByRole('status').filter({ hasText: 'Hit: 4 damage' })).toBeVisible();
  await expect(tray.getByRole('button', { name: /^Other hand:/ })).toHaveCount(0);
});
