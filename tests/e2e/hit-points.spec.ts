import { expect as baseExpect, test, type Page } from '@playwright/test';

import rulesSeed from '../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  anchor,
  clickWhereShown,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * Hit points at the table (docs/adr/0048-hit-points.md): the DM gives Elowen temporary hit points,
 * which she sees beside her own; remade a fighter (Strength 16) with a greatsword, she knocks the
 * raider beside her out instead of killing it — the browser server's d20 shows 11, so 17 hits AC
 * 15, and 4 + 4 + 3 brings its 10 hit points to 0; the DM brings an overturned cart into the fight
 * as an object, which takes no turn and shows what it is made of.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const ELOWEN = 'elowen-starwhisper';
const NAME = 'Elowen Starwhisper';
const campaign = COMBAT_CAMPAIGNS.hitPoints;

async function remakeFighter(page: Page) {
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
          weapons: ['greatsword'],
        },
      },
    },
  });
  expect(((await response.json()) as { status: string }).status).toBe('accepted');
}

test('temporary hit points, a raider knocked out, and a cart brought in to break', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const player = await (await browser.newContext()).newPage();
  const dm = await (await browser.newContext()).newPage();
  await enterCombat(player, campaign);
  await remakeFighter(player);
  await enterWorld(dm, TOKENS.dm, campaign);

  // The DM's hand: five temporary hit points, with a reason.
  await openSheet(dm, 'Party');
  const card = dm
    .locator('#sheet-party')
    .getByRole('listitem')
    .filter({ has: dm.getByText(NAME, { exact: true }) });
  await card.getByRole('button', { name: `Damage or heal: ${NAME}`, exact: true }).click();
  const form = card.locator('form.hand-form').first();
  await form.getByLabel('Temporary hit points', { exact: true }).check();
  await form.getByLabel('Amount', { exact: true }).fill('5');
  await form.getByLabel('Why (kept in your history)', { exact: true }).fill('Inspiring words');
  await form.getByRole('button', { name: 'Give temporary hit points', exact: true }).click();
  await expect(card.locator('.party-hp')).toContainText('+5 temporary');
  // Her player sees them beside her hit points.
  await expect(anchor(player)).toContainText('+5 temporary');

  // She knocks the raider beside her out instead of killing it.
  await clickWhereShown(player, square(player, 3, 6));
  const tray = turnTray(player);
  await tray.getByRole('checkbox', { name: 'Knock out instead of killing (melee)' }).check();
  await expectAccessible(player, 'the knock out choice');
  expectAccepted(await submit(player, tray.getByRole('button', { name: /with Greatsword$/ })));
  await expect(player.getByRole('status').filter({ hasText: 'It is knocked out.' })).toBeVisible();
  await expect(square(player, 3, 6)).toHaveAccessibleName(/hostile, down, .*unconscious/);

  // The DM brings the cart into the fight: wood, Large, fragile.
  await openSheet(dm, 'Encounter');
  const tools = dm.locator('#sheet-encounter').getByRole('region', { name: 'Turn order' });
  const breaking = tools.getByRole('form', { name: 'Something to break' });
  await breaking.getByLabel('What', { exact: true }).selectOption({ label: 'Overturned cart' });
  await breaking
    .getByLabel('Size', { exact: true })
    .selectOption({ label: 'Large: a cart, a dining table' });
  await breaking
    .getByLabel('Build', { exact: true })
    .selectOption({ label: 'Fragile: a bottle, a rope' });
  // Beside her, just south.
  await breaking.getByLabel('Square across', { exact: true }).fill('2');
  await breaking.getByLabel('Square down', { exact: true }).fill('7');
  await expectAccessible(dm, 'the object form');
  await breaking.getByRole('button', { name: 'Bring it into the fight', exact: true }).click();
  const row = tools.locator('ol.turn-order > li').filter({ hasText: 'Overturned cart' });
  await expect(row).toContainText('Wood · Large');
  await expect(row.getByRole('button', { name: /^Initiative/ })).toHaveCount(0);

  // The player sees an object on the board, with what it is made of, and breaks it with her
  // second attack: no knock out to choose, 11 damage against its 5 hit points.
  await expect(square(player, 2, 7)).toHaveAccessibleName(/object/);
  await clickWhereShown(player, square(player, 2, 7));
  const options = player.locator('.target-card');
  await expect(options.locator('.eyebrow')).toHaveText('Object');
  await expect(options.locator('.side-state')).toHaveText('Wood · Large');
  await expect(tray.getByRole('checkbox', { name: /Knock out/ })).toHaveCount(0);
  expectAccepted(await submit(player, tray.getByRole('button', { name: /with Greatsword$/ })));
  await expect(square(player, 2, 7)).toHaveAccessibleName(/object, destroyed/);
});
