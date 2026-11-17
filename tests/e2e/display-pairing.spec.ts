import { expect, test } from '@playwright/test';

import { SIGN_IN_ORIGIN } from './support/sign-in.ts';

/**
 * The table's screen and its code (docs/adr/0042-table-display.md). Each answer to "a code,
 * please" sets the screen's cookie: two requests sent together left the page showing one code and
 * holding the other's cookie whenever the first answer came after the second, and the DM's "Pair"
 * then never reached the screen (reports/WEBKIT_NETWORK_CRASH_2026-11-16.md, "The second cause").
 * No campaign is touched: nobody pairs this screen.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

test('a screen asks for one code and shows the one it holds, however late the answer', async ({
  page,
}) => {
  const answered: string[] = [];
  await page.route('**/api/display/pair', async (route) => {
    const first = answered.length === 0;
    const response = await route.fetch();
    answered.push(((await response.json()) as { code: string }).code);
    // The first answer is the slow one: a second request, if the page sent one, overtakes it.
    if (first) await new Promise((done) => setTimeout(done, 1_000));
    await route.fulfill({ response });
  });

  const polled = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/display/session' && response.ok(),
  );
  await page.goto('/display');
  const code = page.locator('.display-code');
  await expect(code).toHaveText(/^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/);
  // The screen has asked whether it is paired: whatever it was going to request, it has.
  await polled;
  expect(answered).toHaveLength(1);
  expect((await code.innerText()).replace(' ', '')).toBe(answered[0]);
});
