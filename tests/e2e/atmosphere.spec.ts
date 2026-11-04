import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';

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
 * The table's sound in the browser (docs/adr/0059-atmosphere.md §1, §6; Stage 690a): a paired TV
 * plays what the DM chooses — by the scene (the market square at ten in the morning: a town's
 * crowd; then, under rain, the rain), one soundscape, or none — once someone pressed its one
 * "Sound on"; its corner turns its own sound off and on. Online, a player's screen plays it too,
 * and the player's settings turn it off there alone. What plays is read from the screen's sound
 * element (`data-ambience`, `data-sound`): audio is checked by its graph in the unit tests, never
 * by ear.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = SIGN_IN_CAMPAIGNS.atmosphere;

const sound = (page: Page) => page.locator('.table-sound');
const soundOn = (page: Page) => page.getByRole('button', { name: 'Sound on', exact: true });

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** The DM chooses what the table hears, on the Session sheet. */
async function choose(dm: Page, label: string): Promise<void> {
  await openSheet(dm, 'Session');
  await dm
    .locator('#sheet-session')
    .getByLabel('The table’s sound', { exact: true })
    .selectOption({ label });
}

test('the table hears what the DM chooses, on the TV and online on every screen', async ({
  browser,
}) => {
  test.setTimeout(150_000);

  // A TV pairs; it shows the scene and waits for a press before it plays.
  const tv = await freshPage(browser);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/);
  const dm = await freshPage(browser);
  await joinAsDm(dm, CAMPAIGN);
  await openSheet(dm, 'Table screen');
  const screens = dm.locator('#sheet-screen');
  await screens.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screens.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(tv.locator('main.display')).toHaveAttribute('data-cast', 'scene');
  await expect(sound(tv)).toHaveAttribute('data-sound', 'off');
  await expect(soundOn(tv)).toBeVisible();
  await expectAccessible(tv, 'the table’s screen waiting for a press to play');
  await soundOn(tv).click();
  await expect(sound(tv)).toHaveAttribute('data-sound', 'on');
  await expect(soundOn(tv)).toHaveCount(0);
  // By the scene, the default: the market square lies in Ravenford, at day — a crowd.
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'crowd');

  // The DM sees what plays by the scene.
  await openSheet(dm, 'Session');
  const session = dm.locator('#sheet-session');
  await expect(session.getByLabel('The table’s sound', { exact: true })).toHaveValue('scene');
  await expect(session.getByText('Now by the scene: Crowd.', { exact: true })).toBeVisible();
  await expectAccessible(dm, 'the DM’s choice of the table’s sound');

  // Elowen's player sits down: at the table the phone stays quiet, and the party sees the sky.
  const link = await invite(dm, 'Elowen Starwhisper');
  const player = await freshPage(browser);
  await openInvitation(player, joinPath(tokenOf(link)));
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();
  await expect(sound(player)).toHaveCount(0);
  // Rain over the square: the crowd gives way to the rain.
  await openSheet(dm, 'Time and weather');
  await dm.getByLabel('Weather at Market Square', { exact: true }).selectOption('rain');
  await dm.getByRole('button', { name: 'Set weather', exact: true }).click();
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'rain');

  // One soundscape, then none.
  await choose(dm, 'Fire');
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'fire');
  await choose(dm, 'No sound');
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'none');

  // The TV turns its own sound off: the DM's choice plays elsewhere, not here.
  await choose(dm, 'Night');
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'night');
  await tv.mouse.move(40, 40);
  await tv.getByRole('button', { name: 'Turn the sound off', exact: true }).click();
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'none');
  await tv.getByRole('button', { name: 'Turn the sound on', exact: true }).click();
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'night');

  // Online, the player's screen plays the table's sound too.
  const online = await dm.evaluate(
    (path) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'online' }),
      }).then((response) => response.status),
    `/api/campaigns/${CAMPAIGN}/lobby?perspective=DM`,
  );
  expect(online).toBe(204);
  await expect(sound(player)).toHaveAttribute('data-ambience', 'night');
  await expect(soundOn(player)).toBeVisible();
  await expectAccessible(player, 'a player’s screen waiting for a press to play');
  await soundOn(player).click();
  await expect(sound(player)).toHaveAttribute('data-sound', 'on');

  // The player turns the table's sound off on their own screen: the TV plays on.
  await openSheet(player, 'Dice');
  const dice = player.locator('#sheet-dice');
  await dice.getByText('Sound and motion', { exact: true }).click();
  await dice.getByLabel('The table’s sound: ambience and music', { exact: true }).uncheck();
  await expect(sound(player)).toHaveAttribute('data-ambience', 'none');
  await expect(dice.getByLabel('Volume of the table’s sound', { exact: true })).toBeDisabled();
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'night');
});

/** Two seconds of a quiet tone as a WAV, 16-bit, 8 kHz: a track the browser plays. */
function tone(): Buffer {
  const rate = 8000;
  const samples = rate * 2;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('the DM’s music plays on the TV from the moment the DM plays it', async ({ browser }) => {
  test.setTimeout(150_000);
  const campaign = SIGN_IN_CAMPAIGNS.music;
  const tv = await freshPage(browser);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/);
  const dm = await freshPage(browser);
  await joinAsDm(dm, campaign);
  await openSheet(dm, 'Table screen');
  const screens = dm.locator('#sheet-screen');
  await screens.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screens.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(tv.locator('main.display')).toHaveAttribute('data-cast', 'scene');
  await soundOn(tv).click();
  const music = tv.locator('.table-music');
  await expect(music).toHaveAttribute('data-music', 'none');

  // The DM adds a track from a file; a file that is no sound is refused.
  await openSheet(dm, 'Session');
  const panel = dm.locator('#sheet-session').getByRole('region', { name: 'Music', exact: true });
  await expect(panel).toContainText('No tracks yet.');
  const file = panel.getByLabel('Add a track', { exact: true });
  await file.setInputFiles({
    name: 'notes.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('not a song'),
  });
  await expect(panel.getByRole('alert')).toHaveText(
    'This file is not an MP3, OGG, M4A or WAV sound.',
  );
  await file.setInputFiles({ name: 'Tavern song.wav', mimeType: 'audio/wav', buffer: tone() });
  const tracks = panel.getByRole('list', { name: 'Tracks' });
  await expect(tracks.getByRole('listitem')).toHaveCount(1);
  await expect(tracks).toContainText('Tavern song');
  await expectAccessible(dm, 'the DM’s music');

  // Played on repeat, it plays on the TV; paused, resumed, stopped there too.
  await tracks.getByRole('button', { name: 'Play on repeat: Tavern song', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Playing: Tavern song · on repeat');
  await expect(music).toHaveAttribute('data-music', 'playing');
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Paused: Tavern song · on repeat');
  await expect(music).toHaveAttribute('data-music', 'paused');
  await panel.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(music).toHaveAttribute('data-music', 'playing');
  // Online, it plays on the DM's own screen too.
  const online = await dm.evaluate(
    (path) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'online' }),
      }).then((response) => response.status),
    `/api/campaigns/${campaign}/lobby?perspective=DM`,
  );
  expect(online).toBe(204);
  await expect(dm.locator('.table-music')).toHaveAttribute('data-music', 'playing');
  await panel.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(music).toHaveAttribute('data-music', 'none');
  await expect(dm.locator('.table-music')).toHaveAttribute('data-music', 'none');

  // Deleting asks first; kept, it stays; deleted, it goes.
  await tracks.getByRole('button', { name: 'Delete: Tavern song', exact: true }).click();
  await panel.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(tracks.getByRole('listitem')).toHaveCount(1);
  await tracks.getByRole('button', { name: 'Delete: Tavern song', exact: true }).click();
  await panel.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(panel).toContainText('No tracks yet.');
});
