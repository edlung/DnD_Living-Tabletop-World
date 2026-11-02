import { expect as baseExpect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  battlefield,
  clickWhereShown,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { TOKENS, enterWorld } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * Opportunity attacks and the readied attack (docs/adr/0046-reactions-beyond-counterspell.md §2,
 * §5) at the table: a move out of reach waits for the answer — the DM's for a raider, the
 * player's for Elowen — and goes on after; an arrow readied on her turn flies when her player
 * says its moment has come. The ambush starts with Raider 1 beside Elowen, at (3,6); the order
 * is Elowen, then the Raiders, then the Shaman.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const RAIDER_1 = 'creature-10fb59d4';

async function dmCommand(page: Page, campaign: string, commandId: string, command: unknown) {
  const response = await page.request.post(`/api/campaigns/${campaign}/commands`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    data: { commandId: `${campaign}.${commandId}`, command },
  });
  return (await response.json()) as { status: string; code?: string };
}

test('leaving a raider’s reach waits for the DM’s answer, then the move goes on', async ({
  browser,
}) => {
  const campaign = COMBAT_CAMPAIGNS.opportunity;
  const player = await browser.newPage();
  const dm = await browser.newPage();
  await enterCombat(player, campaign);
  await enterCombat(dm, campaign, TOKENS.dm);
  await square(player, 0, 6).click();
  expectAccepted(await submit(player, turnTray(player).getByRole('button', { name: 'Move here' })));

  // The DM is asked for the raider: an attack with its scimitar, or let it go.
  await openSheet(dm, 'Encounter');
  const card = dm.locator('#sheet-encounter .tool-card--reaction');
  await expect(card).toContainText("Elowen Starwhisper's move is waiting for opportunity attacks.");
  await expect(
    card.getByRole('button', { name: /opportunity attack with Scimitar$/ }),
  ).toBeVisible();
  await expectAccessible(dm, 'the DM answering an opportunity attack');
  expectAccepted(await submit(dm, card.getByRole('button', { name: /: let it go$/ })));

  // Her move went on to where she meant to go.
  await expect(square(player, 0, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
});

test('a raider leaving her reach asks her player; her readied arrow flies when she says', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const campaign = COMBAT_CAMPAIGNS.readied;
  const player = await browser.newPage();
  await enterCombat(player, campaign);

  // On her turn she readies the longbow against the raider beside her, then ends the turn.
  await clickWhereShown(player, square(player, 3, 6));
  const tray = turnTray(player);
  await tray.getByRole('button', { name: /^Ready an action against/ }).click();
  const form = tray.getByRole('form', { name: 'Ready an attack' });
  await form.getByLabel('When it happens', { exact: true }).fill('When it runs for the wagons');
  expectAccepted(await submit(player, form.getByRole('button', { name: 'Ready the attack' })));
  expectAccepted(await submit(player, tray.getByRole('button', { name: 'End turn' })));

  // The raider runs east, out of her reach: her player is asked.
  const ran = await dmCommand(player, campaign, 'raider-runs', {
    type: 'MoveCombatant',
    combatantId: RAIDER_1,
    path: [
      { x: 4, y: 6 },
      { x: 5, y: 6 },
    ],
  });
  expect(ran.status).toBe('accepted');
  const prompt = player.getByRole('alertdialog', { name: 'Reaction: Opportunity Attack' });
  await expect(prompt).toContainText('is leaving your reach');
  await expect(
    prompt.getByRole('button', { name: /opportunity attack with Unarmed Strike$/ }),
  ).toBeVisible();
  await expectAccessible(player, 'the opportunity attack prompt');
  expectAccepted(await submit(player, prompt.getByRole('button', { name: 'Let it go' })));
  await expect(prompt).toBeHidden();
  await expect(battlefield(player).getByRole('button', { name: /^Square 5, 6:/ })).toBeVisible();

  // Her Reaction is still hers: the readied arrow flies now.
  const readied = player.locator('.readied-card');
  await expect(readied).toContainText('“When it runs for the wagons”');
  await expectAccessible(player, 'the readied attack');
  expectAccepted(
    await submit(player, readied.getByRole('button', { name: 'Make the readied attack' })),
  );
  await expect(readied).toBeHidden();
});

test('in Russian, the raider leaving her reach asks in Russian', async ({ browser }) => {
  const campaign = COMBAT_CAMPAIGNS.opportunityRu;
  const player = await browser.newPage();
  await enterWorld(player, TOKENS.player, campaign);
  const field = player.getByRole('region', { name: 'Поле боя', exact: true });
  const tray = field.getByRole('region', { name: 'Действия хода', exact: true });
  expectAccepted(await submit(player, tray.getByRole('button', { name: 'Закончить ход' })));
  const ran = await dmCommand(player, campaign, 'raider-runs', {
    type: 'MoveCombatant',
    combatantId: RAIDER_1,
    path: [{ x: 4, y: 6 }],
  });
  expect(ran.status).toBe('accepted');
  const prompt = player.getByRole('alertdialog', { name: 'Реакция: Провоцированная атака' });
  await expect(prompt).toContainText('выходит из вашей досягаемости');
  await expect(prompt.getByRole('button', { name: 'Безоружный удар' })).toBeVisible();
  expectAccepted(await submit(player, prompt.getByRole('button', { name: 'Пропустить' })));
});
