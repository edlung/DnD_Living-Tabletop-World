import { expect, test } from '@playwright/test';

import { expectAccepted, submit } from './support/combat.ts';
import { dmRequest, playerCommand } from './support/authoring.ts';
import { collectApiBodies, enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, openChronicle, openSheet } from './support/shell.ts';
import campaigns from './fixtures/dm-tool-campaigns.json' with { type: 'json' };

test('the DM moves time and weather and the player returns to a changed Ravenford', async ({
  browser,
}) => {
  const campaign = campaigns.time;
  const player = await browser.newPage();
  await enterWorld(player, TOKENS.player, campaign);
  const conditions = player.getByLabel('Scene conditions');
  await expect(conditions).toContainText('Day 1 · 10:00');
  await expect(conditions).not.toContainText('rain');

  const dm = await browser.newPage();
  await enterWorld(dm, TOKENS.dm, campaign);
  await openSheet(dm, 'Time and weather');
  await expect(dm.getByText('Time and weather (DM)', { exact: true })).toBeVisible();
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Advance to Day 2, 10:00' })));
  await dm.getByLabel('Weather at Market Square').selectOption('rain');
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Set weather' })));
  await expect(dm.getByLabel('Scene conditions')).toContainText('Day 2 · 10:00');
  // The day control now offers the next morning, never a day already reached (ADR 0033 §8).
  await expect(dm.getByRole('button', { name: 'Advance to Day 3, 10:00' })).toBeVisible();
  await expect(dm.getByRole('button', { name: 'Advance to Day 2, 10:00' })).toHaveCount(0);

  // The player looks again and finds a different morning.
  await player.getByRole('button', { name: 'Refresh world' }).click();
  await expect(conditions).toContainText('Day 2 · 10:00');
  await expect(conditions).toContainText('rain');
  await player.close();
  await dm.close();
});

test('a written chapter opens for the player with cited entries and a flashback', async ({
  browser,
}) => {
  const campaign = campaigns.chronicle;
  const dm = await browser.newPage();
  await enterWorld(dm, TOKENS.dm, campaign);
  await openChronicle(dm);
  await dm.getByText('Write a chapter (DM)', { exact: true }).click();
  await dm.getByLabel('Told from', { exact: true }).selectOption('CHARACTER:elowen-starwhisper');
  await dm.getByRole('button', { name: 'Write chapter' }).click();
  // The browser-test server has no narrator (ADR 0032, C): the chapter is the plain record, said so.
  await expect(
    dm.getByRole('status').filter({
      hasText: 'Chapter written as the plain record: the narrator was unavailable.',
    }),
  ).toBeVisible();

  const player = await browser.newPage();
  const traffic = collectApiBodies(player);
  await enterWorld(player, TOKENS.player, campaign);
  await openChronicle(player);
  const chapter = player.getByRole('article', { name: 'Chapter I — Shadows on the Trade Road' });
  await expect(chapter).toBeVisible();
  await expect(chapter).toContainText('Mira told us the caravan left before dawn.');
  await chapter
    .getByRole('listitem')
    .filter({ hasText: 'Mira told us the caravan left before dawn.' })
    .getByRole('button', { name: 'Open flashback' })
    .click();
  const flashback = player.getByRole('region', { name: 'Flashback' });
  await expect(flashback).toBeVisible();
  await expect(flashback).toContainText('Mira');
  await expect(flashback).toContainText('Day 1');
  await traffic.assertPlayerBoundary([], ['"abandoned-caravan-site"']);
  await player.close();
  await dm.close();
});

test('the DM performs Tomas for Elowen and the words are not recorded as fact', async ({
  browser,
}) => {
  const campaign = campaigns.perform;
  const dm = await browser.newPage();
  // Tomas is authored through the same routes the authoring screen uses.
  const intent = await dmRequest(dm, campaign, 'post', 'ai/intents', {
    text: 'Add a young guard near North Gate who saw the caravan leave.',
  });
  const traceId = (intent.body as { traceId: string }).traceId;
  const created = await dmRequest(dm, campaign, 'post', 'authoring/proposals', { traceId });
  const proposal = created.body as {
    proposal: { proposalId: string };
    preview: { confirmation: unknown };
  };
  const committed = await dmRequest(
    dm,
    campaign,
    'post',
    `authoring/proposals/${proposal.proposal.proposalId}/commit`,
    { revision: 1, confirmation: proposal.preview.confirmation },
  );
  expect(committed.body).toMatchObject({ status: 'accepted' });
  expect(
    (
      await playerCommand(dm, campaign, 'to-gate', {
        type: 'EnterLocation',
        characterId: 'elowen-starwhisper',
        locationId: 'north-gate',
      })
    ).body,
  ).toMatchObject({ status: 'accepted' });

  await enterWorld(dm, TOKENS.dm, campaign);
  await chooseLocation(dm, 'north-gate');
  await dm.getByRole('button', { name: 'Tomas Reed', exact: true }).click();
  await dm.getByText('Perform Tomas Reed (DM)', { exact: true }).click();
  await dm.getByRole('button', { name: 'Speak as Tomas Reed' }).click();
  // This server has no voice for NPCs (ADR 0032, C): the panel says no words came, in its own
  // voice — never "Tomas Reed says", never "Spoken, not a recorded fact." over a non-reply.
  const message = dm.locator('.perform-said--message');
  await expect(message).toHaveRole('status');
  await expect(message).toHaveText(
    'No words are available for Tomas Reed right now (the voice is unavailable). You can speak for Tomas Reed yourself.',
  );
  await expect(dm.getByRole('status', { name: 'Tomas Reed says' })).toHaveCount(0);

  await dm.getByLabel('Ask about', { exact: true }).selectOption('guild-caravan');
  const asked = dm.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/npcs/tomas-reed/dialogue'),
  );
  await dm.getByRole('button', { name: 'Answer the question' }).click();
  expect((await (await asked).json()) as { reply: { status: string } | null }).toMatchObject({
    reply: { status: 'AI_UNAVAILABLE' },
  });
  await expect(message).toHaveText(/^No words are available for Tomas Reed right now/);
  await expect(dm.getByRole('status', { name: 'Tomas Reed says' })).toHaveCount(0);
  await expect(dm.getByText('Spoken, not a recorded fact.')).toHaveCount(0);
  await dm.close();
});

test('refusals and technical words are explained in plain language', async ({ browser }) => {
  const campaign = campaigns.chronicle;
  const dm = await browser.newPage();
  await enterWorld(dm, TOKENS.dm, campaign);
  // Elowen is at Market Square, so Captain Thorne at North Gate cannot hear her.
  await chooseLocation(dm, 'north-gate');
  await dm.getByRole('button', { name: 'Captain Thorne', exact: true }).click();
  await dm.getByText('Perform Captain Thorne (DM)', { exact: true }).click();
  await dm.getByRole('button', { name: 'Speak as Captain Thorne' }).click();
  // A refusal is the panel's own status, never framed as the NPC speaking.
  const refusal = dm
    .getByRole('status')
    .filter({ hasText: 'is not in the same place as this character' });
  await expect(refusal).toBeVisible();
  await expect(refusal).not.toContainText('Spoken, not a recorded fact.');
  await expect(dm.getByRole('status', { name: 'Captain Thorne says' })).toHaveCount(0);
  // Remembered events, in the Journal, read as world time, not raw seconds.
  await openSheet(dm, 'Journal');
  await expect(dm.locator('.memory-list')).toBeVisible();
  await expect(dm.locator('.memory-list')).not.toContainText(/-?\d{6,}/);
  await dm.close();
});
