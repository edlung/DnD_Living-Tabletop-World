import { expect, test, type Page } from '@playwright/test';

import { LIVE_URL } from './support/live.ts';
import { dockButton } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  invite,
  joinAsDm,
  joinPath,
  takeSeat,
} from './support/sign-in.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const words = WORDS.en;
const signOut = (page: Page) => page.getByRole('button', { name: words.signOut, exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: words.signOutQuestion });

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function probe(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session');
    const body = (await response.json()) as { campaignId?: string };
    return { status: response.status, campaignId: body.campaignId };
  });
}

async function actor(page: Page, campaignId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/campaigns/${id}/session`);
    const body = (await response.json()) as { actorId: string };
    return body.actorId;
  }, campaignId);
}

/** Hold stale-tab observation, without faking the authenticated logout response. */
async function keepOldWorld(page: Page) {
  await page.route('**/api/auth/session', (route) => route.abort());
  await page.route('**/api/campaigns/**', (route) => route.abort());
}

async function enter(page: Page, link: string, replace: boolean, dm = true) {
  await page.bringToFront();
  await page.goto(link);
  await takeSeat(page);
  if (replace) {
    const question = accessState(page, words.replaceQuestion);
    await expect(question).toBeVisible();
    await expect(question.getByRole('button', { name: words.keep })).toBeFocused();
    await page.keyboard.press('Tab');
    const confirm = question.getByRole('button', { name: words.replace });
    await expect(confirm).toBeEnabled();
    await confirm.click();
  }
  await expect(
    dm
      ? dockButton(page, words.players)
      : page.getByRole('button', { name: 'Mira Vale', exact: true }),
  ).toBeVisible();
}

async function staleLogout(page: Page, campaignId: string, actorId: string) {
  const answer = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/sign-out') && response.request().method() === 'POST',
  );
  await dialog(page).getByRole('button', { name: words.signOut, exact: true }).click();
  const response = await answer;
  expect(response.status()).toBe(409);
  expect(response.request().headers()['x-game-campaign']).toBe(campaignId);
  expect(response.request().headers()['x-game-actor']).toBe(actorId);
  expect(response.headers()['set-cookie']).toBeUndefined();
  await expect(accessState(page, words.signedOut)).toBeVisible();
  await expect(page.getByRole('heading', { name: words.signedOut, exact: true })).toBeFocused();
}

test('old game logout and delayed refusals preserve the new cookie; history snapshots clear private DOM immediately', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const oldCampaign = SIGN_IN_CAMPAIGNS.gameCookieOld,
    newCampaign = SIGN_IN_CAMPAIGNS.gameCookieNew;
  const context = await browser.newContext();
  // A replaced sign-in's open live stream closes as `unauthenticated` at the server's next
  // recheck (each second) and signs its tab out, on a slow runner before the stale logout is
  // sent. Held down, as in `sign-in-tabs.spec.ts`, the stream leaves that logout as the only way
  // these tabs can learn of a newer sign-in.
  await context.route(LIVE_URL, (route) => route.abort());
  const old = await context.newPage();
  await joinAsDm(old, oldCampaign);
  const oldActor = await actor(old, oldCampaign);
  await keepOldWorld(old);
  await signOut(old).click();
  await expect(dialog(old).getByRole('button', { name: words.stay })).toBeFocused();
  await old.keyboard.press('Escape');
  await expect(dialog(old)).toBeHidden();
  await expect(signOut(old)).toBeFocused();
  await signOut(old).click();

  const replacement = await context.newPage();
  await enter(replacement, joinPath(dmToken(newCampaign)), true);
  await staleLogout(old, oldCampaign, oldActor);
  expect(await probe(replacement)).toEqual({ status: 200, campaignId: newCampaign });

  // A same-campaign replacement must also be bound to the first mounted actor.
  const playerLink = await invite(replacement, 'Elowen Starwhisper');
  const mountedDm = await actor(replacement, newCampaign);
  await keepOldWorld(replacement);
  await signOut(replacement).click();
  const player = await context.newPage();
  await enter(player, playerLink, true, false);
  const playerActor = await actor(player, newCampaign);
  expect(playerActor === mountedDm).toBe(false);
  await staleLogout(replacement, newCampaign, mountedDm);
  expect(await probe(player)).toEqual({ status: 200, campaignId: newCampaign });
  expect(await actor(player, newCampaign)).toBe(playerActor);
  await context.close();

  // Both responses were produced under the old cookie; deliver them after a new login.
  const delayedContext = await browser.newContext(),
    delayed = await delayedContext.newPage();
  const logoutReached = gate(),
    probeReached = gate(),
    release = gate();
  try {
    await joinAsDm(delayed, oldCampaign, 1);
    await keepOldWorld(delayed);
    await delayed.route('**/api/auth/sign-out', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(204);
      expect(response.headers()['set-cookie']).toBeUndefined();
      logoutReached.release();
      await release.promise;
      await route.fulfill({ response });
    });
    await signOut(delayed).click();
    await dialog(delayed).getByRole('button', { name: words.signOut, exact: true }).click();
    await logoutReached.promise;
    await delayed.route('**/api/auth/session', async (route) => {
      if (route.request().headers()['x-game-race-probe'] !== '1') {
        await route.abort();
        return;
      }
      const response = await route.fetch({
        headers: { ...(await route.request().allHeaders()), origin: SIGN_IN_ORIGIN },
      });
      expect(response.status()).toBe(401);
      expect(response.headers()['set-cookie']).toBeUndefined();
      probeReached.release();
      await release.promise;
      await route.fulfill({ response });
    });
    const lateProbe = delayed.evaluate(
      async () =>
        (await fetch('/api/auth/session', { headers: { 'x-game-race-probe': '1' } })).status,
    );
    await probeReached.promise;
    const newest = await delayedContext.newPage();
    await enter(newest, joinPath(dmToken(newCampaign, 1)), false);
    release.release();
    expect(await lateProbe).toBe(401);
    await expect(accessState(delayed, words.signedOut)).toBeVisible();
    expect(await probe(newest)).toEqual({ status: 200, campaignId: newCampaign });
    await expect(dockButton(newest, words.players)).toBeVisible();
  } finally {
    release.release();
    await delayedContext.close();
  }

  // This assertion deliberately reads the same native event's DOM snapshot.
  const snapshotContext = await browser.newContext(),
    snapshot = await snapshotContext.newPage();
  await joinAsDm(snapshot, oldCampaign, 2);
  await expect(snapshot.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  const retained = await snapshot.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return document.body.innerText.includes('Mira Vale');
  });
  expect(retained, 'private game content must already be absent in the pagehide snapshot').toBe(
    false,
  );
  await snapshotContext.close();
});
