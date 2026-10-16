import { expect, test, type Page } from '@playwright/test';

import {
  battlefield,
  COMBAT_CAMPAIGNS,
  ELOWEN,
  enterCombat,
  expectAccepted,
  expendedSlots,
  playerHp,
  submit,
} from './support/combat.ts';
import { TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

const prompt = (page: Page) => page.getByRole('alertdialog', { name: 'Reaction' });
const total = (slots: readonly number[]) => slots.reduce((a, b) => a + b, 0);

test('a valid Counterspell is answered by the domain, spends one slot, and closes the window', async ({
  page,
}) => {
  const campaign = COMBAT_CAMPAIGNS.counter;
  await enterCombat(page, campaign);
  await expect(prompt(page)).toContainText('Unidentified creature 4 is casting a spell');
  await expect(prompt(page)).toContainText('Components: V, S');
  // The spell itself is the caster's secret, not the reacting player's.
  expect(await page.content()).not.toContain('ashen-bolt');
  const before = total(await expendedSlots(page, campaign));
  const countered = await submit(
    page,
    prompt(page).getByRole('button', { name: 'Cast Counterspell' }),
  );
  expectAccepted(countered);
  expect(countered.body.outcome?.kind).toBe('UseReaction');
  await expect(prompt(page)).toHaveCount(0);
  expect(total(await expendedSlots(page, campaign))).toBe(before + 1);
  const message = countered.body.outcome?.countered
    ? 'Counterspell stopped the spell.'
    : 'The reaction was used.';
  await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible();
  if (countered.body.outcome?.countered) expect(await playerHp(page)).toBe(78);
});

test('Don’t interfere lets the spell resolve without spending a slot', async ({ page }) => {
  const campaign = COMBAT_CAMPAIGNS.ignore;
  await enterCombat(page, campaign);
  // The question takes focus once and names the reaction it offers.
  await expect(prompt(page)).toBeFocused();
  await expect(prompt(page)).toHaveAccessibleName('Reaction: Counterspell');
  const before = total(await expendedSlots(page, campaign));
  const ignored = await submit(
    page,
    prompt(page).getByRole('button', { name: 'Don’t interfere', exact: true }),
  );
  expectAccepted(ignored);
  expect(ignored.body.outcome?.kind).toBe('DeclineReaction');
  await expect(prompt(page)).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'You let the spell happen.' }),
  ).toBeVisible();
  expect(total(await expendedSlots(page, campaign))).toBe(before);
});

test('a window the DM closes expires for the player, and the stale answer is refused', async ({
  browser,
}) => {
  const campaign = COMBAT_CAMPAIGNS.expire;
  const player = await browser.newPage();
  const dm = await browser.newPage();
  // The player's live connection is down (ADR 0033), so only the backend learns of the close.
  await player.route(/\/api\/campaigns\/[^/]+\/live\?/, (route) => route.abort('failed'));
  let encounterReads = 0;
  player.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (response.request().method() === 'GET' && path.endsWith('/encounter')) encounterReads += 1;
  });
  await enterCombat(player, campaign);
  await expect(prompt(player)).toBeVisible();
  // Its screen settles first: the read that follows every read (ADR 0033 §4) is done before
  // the DM acts, and with no signal nothing reads again.
  await expect.poll(() => encounterReads).toBeGreaterThanOrEqual(2);
  const before = total(await expendedSlots(player, campaign));

  await enterCombat(dm, campaign, TOKENS.dm);
  await openSheet(dm, 'Encounter');
  await expect(dm.getByText('Encounter controls (DM)', { exact: true })).toBeVisible();
  const closed = await submit(dm, dm.getByRole('button', { name: 'Close reaction window' }));
  expectAccepted(closed);
  expect(JSON.stringify(closed.body)).toContain('ReactionWindowExpired');
  await expect(dm.getByRole('button', { name: 'Close reaction window' })).toHaveCount(0);

  // The player's screen is still the old one: only the backend knows the window closed.
  await expect(prompt(player)).toBeVisible();
  const stale = await submit(
    player,
    prompt(player).getByRole('button', { name: 'Cast Counterspell' }),
  );
  expect(stale.response.status()).toBe(422);
  expect(stale.body).toMatchObject({ status: 'rejected', code: 'REACTION_WINDOW_CLOSED' });
  await expect(
    player.getByRole('status').filter({ hasText: 'That reaction window has already closed.' }),
  ).toBeVisible();
  await expect(prompt(player)).toHaveCount(0);
  expect(total(await expendedSlots(player, campaign))).toBe(before);
  await expect(battlefield(player)).toBeVisible();
  await player.close();
  await dm.close();
});

test('a duplicate or repeated answer never spends a second slot', async ({ page }) => {
  const campaign = COMBAT_CAMPAIGNS.stale;
  await enterCombat(page, campaign);
  const windowId = (
    (await (
      await page.request.get(`/api/campaigns/${campaign}/encounter`, {
        headers: { authorization: `Bearer ${TOKENS.player}` },
        params: { perspective: 'PLAYER' },
      })
    ).json()) as { encounter: { reactionWindow: { windowId: string } } }
  ).encounter.reactionWindow.windowId;
  const before = total(await expendedSlots(page, campaign));
  const send = async (commandId: string) =>
    (
      await page.request.post(`/api/campaigns/${campaign}/commands`, {
        headers: { authorization: `Bearer ${TOKENS.player}` },
        data: {
          commandId,
          command: {
            type: 'UseReaction',
            combatantId: ELOWEN,
            windowId,
            reaction: 'counterspell',
          },
        },
      })
    ).json() as Promise<{ status: string; code?: string }>;

  expect((await send('first-answer')).status).toBe('accepted');
  // The same command ID again is a duplicate of the original outcome.
  expect((await send('first-answer')).status).toBe('duplicate');
  // A new command for the now-closed window is refused outright.
  expect(await send('second-answer')).toMatchObject({
    status: 'rejected',
    code: 'REACTION_WINDOW_CLOSED',
  });
  expect(total(await expendedSlots(page, campaign))).toBe(before + 1);
});
