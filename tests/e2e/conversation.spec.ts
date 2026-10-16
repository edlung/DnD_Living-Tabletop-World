import { expect, test, type Page } from '@playwright/test';

import campaigns from './fixtures/dm-tool-campaigns.json' with { type: 'json' };
import { dmRequest } from './support/authoring.ts';
import { LIVE_URL } from './support/live.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation } from './support/shell.ts';

/**
 * A conversation in the scene (docs/STAGE_320_DESIGN.md §5.3): while it is open its options
 * live in its panel only, so each control exists once; the selection's panel keeps everything
 * else and leads to it; and an NPC who will not talk leaves no "Keep talking" behind.
 */
const details = (page: Page) => page.getByRole('complementary', { name: 'Entity details' });
const conversation = (page: Page) =>
  page.getByRole('region', { name: 'Conversation with Mira Vale', exact: true });
const ASK = 'Ask about Merchant Guild caravan';

test('while a conversation is open each of its controls exists once, and the panel leads to it', async ({
  page,
}) => {
  // Read-only: talking with no dialogue provider records nothing.
  await enterWorld(page);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await expect(details(page).getByRole('button', { name: ASK, exact: true })).toBeVisible();
  await details(page).getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(conversation(page).getByRole('button', { name: ASK, exact: true })).toBeVisible();
  // One control per choice on the whole page: the conversation's.
  await expect(page.getByRole('button', { name: ASK, exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^(Talk|Keep talking)$/ })).toHaveCount(1);
  // The selection's panel keeps everything else, and leads to the conversation.
  await expect(details(page).getByRole('button', { name: 'Inspect', exact: true })).toBeVisible();
  await expect(details(page)).toContainText(
    'What you can say to Mira Vale is in your conversation.',
  );
  await details(page).getByRole('button', { name: 'Go to the conversation', exact: true }).click();
  await expect(conversation(page)).toBeFocused();
  // Leaving the conversation gives the panel its conversation choices back.
  await conversation(page).getByRole('button', { name: 'Leave the conversation' }).click();
  await expect(conversation(page)).toHaveCount(0);
  await expect(details(page).getByRole('button', { name: ASK, exact: true })).toBeVisible();
});

test('an NPC who will not talk now leaves no conversation open, and says why', async ({
  browser,
}) => {
  const campaign = campaigns.conversation;
  const player = await browser.newPage();
  // Her view stays as it was: the live signal is cut, so "Keep talking" is still offered when
  // Mira has gone, and the server, not the client, refuses it.
  await player.route(LIVE_URL, (route) => route.abort());
  await enterWorld(player, TOKENS.player, campaign);
  await chooseLocation(player, 'market-square');
  await player.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await details(player).getByRole('button', { name: 'Talk', exact: true }).click();
  const keepTalking = conversation(player).getByRole('button', { name: 'Keep talking' });
  await expect(keepTalking).toBeEnabled();

  const moved = await dmRequest(player, campaign, 'post', 'commands', {
    commandId: `${campaign}.mira-leaves`,
    command: { type: 'PlaceEntity', entityId: 'mira-vale', locationId: 'north-gate' },
  });
  expect(moved.body).toMatchObject({ status: 'accepted' });
  await keepTalking.click();
  await expect(
    player
      .getByRole('status', { name: 'Action result' })
      .filter({ hasText: 'The conversation is not available now.' }),
  ).toBeVisible();
  await expect(conversation(player)).toHaveCount(0);
  await expect(player.getByRole('button', { name: 'Keep talking' })).toHaveCount(0);
  await player.close();
});
