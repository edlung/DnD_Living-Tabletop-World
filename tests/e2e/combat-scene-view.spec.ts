import { expect, test } from '@playwright/test';

import { battlefield, enterCombat, expectAccepted, submit, turnTray } from './support/combat.ts';
import { expectLive, LIVE_CAMPAIGNS, turnBanner } from './support/live.ts';
import { TOKENS } from './support/session.ts';
import { expectOnTop, openSheet } from './support/shell.ts';

/**
 * A player who looks at the scene during an encounter (docs/STAGE_320_DESIGN.md §5.5,
 * docs/adr/0033-live-session.md): whose turn it is and a reaction the player is asked for stay
 * over the scene — heard, shown and answerable — and no view is forced on the player. The
 * campaign waits on the Goblin Shaman's turn before the DM casts
 * (`apps/server/src/testing/ui-live-campaigns.ts`).
 */
test('on the scene view a player still hears whose turn it is and answers a reaction', async ({
  browser,
}) => {
  const campaign = LIVE_CAMPAIGNS.sceneWindow;
  const player = await browser.newPage();
  const dm = await browser.newPage();
  await enterCombat(player, campaign);
  await enterCombat(dm, campaign, TOKENS.dm);
  await expectLive(player);
  await expectLive(dm);

  // The player chooses the scene while the creatures act: the battlefield steps aside, the
  // turn stays on screen.
  const sceneTab = player.getByRole('tab', { name: 'Scene', exact: true });
  await sceneTab.click();
  await expect(battlefield(player)).toBeHidden();
  await expect(turnBanner(player)).toHaveText("Unidentified creature 4's turn");
  await expectOnTop(turnBanner(player));

  // The DM's shaman casts: the question reaches the scene view, takes focus and is answered.
  await openSheet(dm, 'Encounter');
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Run suggested spell' })));
  const prompt = player.getByRole('alertdialog', { name: 'Reaction: Counterspell' });
  await expect(prompt).toBeVisible();
  await expect(prompt).toBeFocused();
  await expectOnTop(prompt);
  await expect(turnBanner(player)).toHaveText('Your reaction is needed');
  await expectOnTop(turnBanner(player));
  await expect(sceneTab).toHaveAttribute('aria-selected', 'true');
  expectAccepted(
    await submit(player, prompt.getByRole('button', { name: 'Don’t interfere', exact: true })),
  );
  await expect(prompt).toHaveCount(0);

  // The shaman's turn ends: round 2 opens with Elowen, and the scene view says so.
  const ended = await dm.request.post(`/api/campaigns/${campaign}/commands`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    data: {
      commandId: `${campaign}.journey.end-shaman`,
      command: { type: 'EndTurn', combatantId: 'goblin-shaman' },
    },
  });
  expect(((await ended.json()) as { status: string }).status).toBe('accepted');
  await expect(turnBanner(player)).toHaveText('Your turn');
  await expectOnTop(turnBanner(player));
  await expect(sceneTab).toHaveAttribute('aria-selected', 'true');

  // The battlefield is one click away, with the turn's tray.
  await player.getByRole('tab', { name: 'Battlefield', exact: true }).click();
  await expect(turnTray(player).getByRole('button', { name: 'End turn' })).toBeVisible();
  await player.close();
  await dm.close();
});
