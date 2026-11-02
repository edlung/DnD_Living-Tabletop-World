import { expect, test, type Page, type Route } from '@playwright/test';

import { enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, openChronicle, openSheet } from './support/shell.ts';
import campaigns from './fixtures/dm-tool-campaigns.json' with { type: 'json' };

/**
 * Honest AI feedback (docs/STAGE_300_REMEDIATION_DESIGN.md §2–3; ADR 0032, checkpoint C). The
 * browser-test server has no dialogue or Chronicle provider, and `ui-ai-no-start` never gets a
 * durable request start, so its AI answers carry a null trace ID. Only delays are intercepted
 * (real server answers), to observe the waiting states: the client says what it waits for, never
 * promises a reply or a trace that will not come, never sends a null source to authoring, and
 * discards a reply that arrives for an NPC the DM has left.
 */
const isDialogue = (url: URL) => /\/npcs\/[^/]+\/dialogue$/.test(url.pathname);

/** Holds each dialogue request until `release`, then sends it on to the real server. */
function holdDialogue(page: Page) {
  const held: Route[] = [];
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = page.route(isDialogue, async (route) => {
    held.push(route);
    await released;
    await route.continue().catch(() => undefined);
  });
  return {
    ready,
    release: () => {
      release();
    },
    held,
  };
}

test('a player waits for a reply and is told honestly that no words came', async ({ page }) => {
  await enterWorld(page, TOKENS.player, campaigns.aiFeedback);
  await chooseLocation(page, 'market-square');
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  const hold = holdDialogue(page);
  await hold.ready;
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Waiting for a reply…' })).toBeVisible();
  const answered = page.waitForResponse((response) => isDialogue(new URL(response.url())));
  hold.release();
  const body = (await (await answered).json()) as { reply: { status: string } | null };
  expect(body.reply?.status).toBe('AI_UNAVAILABLE');
  await expect(
    page.getByText('No spoken reply is available. You can still ask about a subject.'),
  ).toBeVisible();
  await expect(page.getByText('Waiting for a reply…')).toHaveCount(0);
});

test('the DM sees the NPC replying, and a late reply never lands on another listener', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, campaigns.aiFeedback);
  await chooseLocation(page, 'market-square');
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await page.getByText('Perform Mira Vale (DM)', { exact: true }).click();
  await page.getByLabel('What the character says (optional)').fill('Good morning.');

  // An answer that arrives: the waiting state, then the honest unavailable voice; the draft stays.
  const first = holdDialogue(page);
  await first.ready;
  await page.getByRole('button', { name: 'Speak as Mira Vale' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Mira Vale is replying…' }),
  ).toBeVisible();
  first.release();
  // No words came: the panel says so in its own voice, never framed as Mira speaking.
  const noWords = page.getByRole('status').filter({
    hasText: 'No words are available for Mira Vale right now (the voice is unavailable).',
  });
  await expect(noWords).toBeVisible();
  await expect(noWords).not.toContainText('Spoken, not a recorded fact.');
  await expect(page.getByRole('status', { name: 'Mira Vale says' })).toHaveCount(0);
  await expect(page.getByLabel('What the character says (optional)')).toHaveValue('Good morning.');
  await page.unroute(isDialogue);

  // A reply still in flight when the DM switches who Mira speaks with is discarded: it was
  // spoken to Bram, not to Elowen.
  await page.getByLabel('Speaking with').selectOption('character-7beabb40');
  const second = holdDialogue(page);
  await second.ready;
  await page.getByRole('button', { name: 'Speak as Mira Vale' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Mira Vale is replying…' }),
  ).toBeVisible();
  await expect(page.getByLabel('Speaking with')).toHaveValue('character-7beabb40');
  await page.getByLabel('Speaking with').selectOption('elowen-starwhisper');
  await expect(page.getByText('Mira Vale is replying…')).toHaveCount(0);
  // The held request was aborted by the switch; releasing it delivers nothing to the panel.
  second.release();
  await page.waitForTimeout(500);
  await expect(page.getByRole('status', { name: 'Mira Vale says' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'No words are available' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Speak as Mira Vale' })).toBeEnabled();
});

test('without a recorded request the DM gets no proposal source, and the chapter is the plain record', async ({
  page,
}) => {
  const proposals: string[] = [];
  page.on('request', (request) => {
    // Reading the open drafts on load (owner decisions 11) is not a proposal; creating one is.
    if (
      new URL(request.url()).pathname.endsWith('/authoring/proposals') &&
      request.method() === 'POST'
    ) {
      proposals.push(request.method());
    }
  });
  await enterWorld(page, TOKENS.dm, campaigns.aiNoStart);
  await openSheet(page, 'Add to the world');
  await page
    .getByLabel('Describe what to add', { exact: true })
    .fill('Add a young guard near North Gate who saw the caravan leave.');
  const intent = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/ai/intents'),
  );
  await page.getByRole('button', { name: 'Propose', exact: true }).click();
  expect(await (await intent).json()).toMatchObject({
    status: 'AI_UNAVAILABLE',
    traceId: null,
    proposal: null,
  });
  await expect(
    page.getByRole('alert').filter({
      hasText: 'The assistant is unavailable right now, so nothing was proposed. Try again later.',
    }),
  ).toBeVisible();
  expect(proposals).toEqual([]);
  await expect(page.getByRole('region', { name: 'Authoring proposal', exact: true })).toHaveCount(
    0,
  );

  await openChronicle(page);
  await page.getByText('Write a chapter (DM)', { exact: true }).click();
  const written = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/chronicle') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Write chapter' }).click();
  expect(await (await written).json()).toMatchObject({
    rendering: { status: 'AI_UNAVAILABLE', provider: 'template', traceId: null },
  });
  await expect(
    page.getByRole('status').filter({
      hasText: 'Chapter written as the plain record: the narrator was unavailable.',
    }),
  ).toBeVisible();
});

test('without a recorded request a player still talks, with no reply and no promise', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player, campaigns.aiNoStart);
  await chooseLocation(page, 'market-square');
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  const answered = page.waitForResponse((response) => isDialogue(new URL(response.url())));
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  expect(await (await answered).json()).toMatchObject({
    reply: { status: 'AI_UNAVAILABLE', traceId: null, text: null },
  });
  await expect(
    page.getByText('No spoken reply is available. You can still ask about a subject.'),
  ).toBeVisible();
});
