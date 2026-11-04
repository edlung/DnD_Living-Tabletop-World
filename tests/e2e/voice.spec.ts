import { expect as baseExpect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  invite,
  joinAsDm,
  joinPath,
  openInvitation,
  tokenOf,
} from './support/sign-in.ts';

/**
 * The table's voice in the browser (docs/adr/0060-voice.md; Stage 695): online, the DM and a player
 * join the voice from the Chat sheet and hear each other — proved by each connection's statistics,
 * a tone standing in for the microphone arriving, never by ear; the DM mutes the player for everyone and removes
 * them; back at the table, the voice is gone.
 */
test.use({
  baseURL: SIGN_IN_ORIGIN,
  trace: 'off',
  screenshot: 'off',
  launchOptions: {
    // The tone below plays without a press; and the screens' own addresses, not mDNS names a test
    // machine resolves slowly (both screens run on one machine here).
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  },
});

/**
 * A microphone that is a tone: the page asks for one as for any microphone, and gets a quiet
 * 440 Hz from Web Audio. No system microphone is touched, so no operating system's question about
 * it can hold the test (macOS asks the browser's host for one even when the browser fakes it).
 */
const TONE_MICROPHONE = `
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext();
    const tone = context.createOscillator();
    tone.frequency.value = 440;
    const level = context.createGain();
    level.gain.value = 0.2;
    const out = context.createMediaStreamDestination();
    tone.connect(level).connect(out);
    tone.start();
    return out.stream;
  };
`;

const expect = baseExpect.configure({ timeout: 20_000 });
const CAMPAIGN = SIGN_IN_CAMPAIGNS.voice;

const voice = (page: Page) => page.locator('#sheet-chat').getByRole('region', { name: 'Voice' });
/** The other speaker's row in a screen's list of who is in the voice. */
const other = (page: Page) =>
  voice(page).getByRole('list', { name: 'In the voice' }).locator('li:not([data-state="self"])');

async function mode(dm: Page, next: 'online' | 'table') {
  const status = await dm.evaluate(
    ([path, body]) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }).then((response) => response.status),
    [`/api/campaigns/${CAMPAIGN}/lobby?perspective=DM`, JSON.stringify({ mode: next })] as const,
  );
  expect(status).toBe(204);
}

test('online, the DM and a player hear each other; the DM mutes and removes', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const screen = async () => {
    const context = await browser.newContext();
    await context.addInitScript(TONE_MICROPHONE);
    return context.newPage();
  };
  const dm = await screen();
  await joinAsDm(dm, CAMPAIGN);
  const link = await invite(dm, 'Elowen Starwhisper');
  const player = await screen();
  await openInvitation(player, joinPath(tokenOf(link)));
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();

  // At the table there is no voice; online, the Chat sheet holds it.
  await openSheet(player, 'Chat');
  await expect(voice(player)).toHaveCount(0);
  await mode(dm, 'online');
  await expect(voice(player)).toBeVisible();
  await openSheet(dm, 'Chat');
  for (const page of [dm, player]) {
    await voice(page).getByRole('button', { name: 'Join the voice', exact: true }).click();
  }

  // Each hears the other: connected, and sound arriving.
  for (const page of [dm, player]) {
    await expect(other(page)).toHaveAttribute('data-state', 'connected');
    await expect(other(page)).toHaveAttribute('data-hearing', 'true');
  }
  await expect(other(player)).toContainText('The DM');
  await expect(other(dm)).toContainText('Elowen Starwhisper');
  await expectAccessible(player, 'the voice on a player’s Chat sheet');

  // The microphone off, the player holds to talk.
  await voice(player).getByRole('button', { name: 'Microphone on', exact: true }).click();
  await expect(
    voice(player).getByRole('button', { name: 'Hold to talk', exact: true }),
  ).toBeVisible();

  // The DM mutes the player for everyone, then lets them talk again.
  await other(dm)
    .getByRole('button', { name: 'Mute for everyone: Elowen Starwhisper', exact: true })
    .click();
  await expect(voice(player)).toContainText('The DM muted you.');
  await expect(other(dm)).toContainText('muted by the DM');
  await other(dm)
    .getByRole('button', { name: 'Let talk: Elowen Starwhisper', exact: true })
    .click();
  await expect(voice(player)).not.toContainText('The DM muted you.');

  // Removed, the player is out, and may join again.
  await other(dm)
    .getByRole('button', { name: 'Remove from the voice: Elowen Starwhisper', exact: true })
    .click();
  await expect(voice(player)).toContainText('The DM took you out of the voice.');
  await expect(other(dm)).toHaveCount(0);
  await voice(player).getByRole('button', { name: 'Join the voice', exact: true }).click();
  await expect(other(dm)).toHaveAttribute('data-hearing', 'true');

  // Back at the table, the voice is gone.
  await mode(dm, 'table');
  await expect(voice(player)).toHaveCount(0);
});
