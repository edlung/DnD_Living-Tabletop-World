import { expect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, WORDS, joinAsDm } from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * A scene that brings its sound (docs/adr/0073-table-ideas.md §6, Stage 850), on the
 * invitation-mode servers, where the table's screen lives: the DM keeps a sound for a place where
 * the place is shown; showing it switches the sound on — the TV plays it, Session shows it — and
 * the DM's own choice still changes it afterwards. What plays is read from the screen's sound
 * element (`data-ambience`), as `atmosphere.spec.ts` does. No trace or screenshot is kept: the
 * pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 20_000 };
const SPACED_CODE = /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/;
const sound = (page: Page) => page.locator('.table-sound');

test('showing a place switches its sound on, and the DM’s choice still stands after', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = SIGN_IN_CAMPAIGNS.placeSound;

  // The TV waits with its code; the DM pairs it and turns its sound on.
  const tv = await freshPage(browser);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(SPACED_CODE, LIVE);
  const dm = await freshPage(browser);
  await joinAsDm(dm, campaign);
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(tv.locator('.display-cast')).toBeVisible(LIVE);
  await tv.getByRole('button', { name: 'Sound on', exact: true }).click();
  await expect(sound(tv)).toHaveAttribute('data-sound', 'on');

  // The DM chooses a place to show: its own sound is kept right there.
  const form = screen.getByRole('region', { name: 'What the screens show' });
  await form.getByRole('radio', { name: 'A place’s scene', exact: true }).check();
  // "Where the party is" names no place to keep a sound for.
  await expect(form.getByRole('group', { name: /^The sound of/ })).toHaveCount(0);
  // And says that the place the party is in may bring its own.
  await expect(form).toContainText(
    'If the place the party is in has a kept sound, showing it switches that sound on.',
  );
  await form.getByLabel('Place', { exact: true }).selectOption({ label: 'North Gate' });
  const own = form.getByRole('group', { name: 'The sound of North Gate' });
  await expect(own).toContainText(
    'When you show this place, the table’s sound changes to what is kept here',
  );
  const keep = own.getByRole('button', { name: 'Keep this sound for the place', exact: true });
  await expect(keep).toHaveAttribute('aria-disabled', 'true');
  await own.getByLabel('Ambience', { exact: true }).selectOption({ label: 'Rain' });
  await expectAccessible(dm, 'the cast form with a place’s own sound');
  await keep.click();
  await expect(own.getByRole('status')).toHaveText('Kept.', LIVE);
  // Keeping it changes nothing the table hears.
  await expect(sound(tv)).not.toHaveAttribute('data-ambience', 'rain');

  // Showing the place does: the TV plays rain, and the sheet says what changed — and goes on
  // saying it, though the form is made anew with the cast.
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(
    screen.getByText('Showing the place changed the table’s sound: ambience.', { exact: true }),
  ).toBeVisible(LIVE);
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'rain', LIVE);

  // Session shows what plays, and the DM changes it there as before.
  await openSheet(dm, 'Session');
  const choice = dm.locator('#sheet-session').getByLabel('The table’s sound', { exact: true });
  await expect(choice).toHaveValue('rain', LIVE);
  await choice.selectOption({ label: 'No sound' });
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'none', LIVE);

  // A place without a sound of its own leaves the table's sound alone.
  await openSheet(dm, 'Table screen');
  await form.getByLabel('Place', { exact: true }).selectOption({ label: 'Market Square' });
  const shown = await form.getByLabel('Place', { exact: true }).elementHandle();
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  // The form is made anew once the cast is read back: until then a choice made in it is undone.
  await expect.poll(() => shown.evaluate((node) => node.isConnected), LIVE).toBe(false);
  await expect(form).toContainText('Now: A place’s scene', LIVE);
  await expect(sound(tv)).toHaveAttribute('data-ambience', 'none');
  // The kept sound is there when the place is chosen again.
  await form.getByLabel('Place', { exact: true }).selectOption({ label: 'North Gate' });
  await expect(own.getByLabel('Ambience', { exact: true })).toHaveValue('rain', LIVE);
  // Both left as they are: the press takes the place's sound away, and says so.
  await own.getByLabel('Ambience', { exact: true }).selectOption({ label: 'Leave as it is' });
  await own.getByRole('button', { name: 'Remove this place’s sound', exact: true }).click();
  await expect(own.getByRole('status')).toHaveText('Removed.', LIVE);
});

test('по-русски: звук места в форме показа', async ({ browser }) => {
  test.setTimeout(120_000);
  // The sign-in screen speaks the browser's language; the table, the campaign's.
  const dm = await freshPage(browser, { locale: 'ru-RU' });
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.placeSoundRu, 0, WORDS.ru);
  await openSheet(dm, 'Экран стола');
  const form = dm.locator('#sheet-screen').getByRole('region', { name: 'Что показывают экраны' });
  await form.getByRole('radio', { name: 'Сцену места', exact: true }).check();
  const places = form.getByLabel('Место', { exact: true });
  // Any named place: the second choice, after "where the party is".
  await places.selectOption({ index: 1 });
  const own = form.getByRole('group', { name: /^Звук места: / });
  await expect(own).toContainText('звук стола сменится на сохранённый здесь', LIVE);
  await own.getByLabel('Фон', { exact: true }).selectOption({ label: 'Дождь' });
  await own.getByRole('button', { name: 'Сохранить звук для места', exact: true }).click();
  await expect(own.getByRole('status')).toHaveText('Сохранено.', LIVE);
  await expectAccessible(dm, 'форма показа со звуком места');
});
