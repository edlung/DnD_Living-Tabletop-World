import { expect, test } from '@playwright/test';

import type {
  CampaignRevisionView,
  PresenceResponse,
  QuestListResponse,
  SessionResponse,
} from '../../packages/contracts/src/index.ts';
import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { draftApi } from './support/workshop.ts';
import {
  acknowledgeActivation,
  activationConfirm,
  activationOf,
  chooseTextOnly,
  enterActivatedGame,
  expectPublished,
  openActivation,
  ownedCampaigns,
} from './support/workshop-activation.ts';
import {
  SIGN_IN_CAMPAIGNS,
  WORDS,
  accessState,
  invite,
  joinAsDm,
  openInvitation,
  takeSeat,
} from './support/sign-in.ts';
import { dockButton } from './support/shell.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60000);

test('explicit activation opens the stored world, prepared party, normal player membership and its own quest book', async ({
  page,
  browser,
}) => {
  const name = 'activation-en';
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') calls.push(new URL(request.url()).pathname);
  });
  await openActivation(page, name);
  await expect(activationConfirm(page)).toBeDisabled();
  expect(calls.filter((path) => path.endsWith('/activation'))).toHaveLength(0);
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'ltw_session')).toBe(
    false,
  );
  await chooseTextOnly(page);
  await acknowledgeActivation(page);
  await activationConfirm(page).click();
  await expectPublished(page);
  const accepted = await activationOf(page, name);
  expect(accepted.revision).toBe(1);
  expect(accepted.textOnly).toBe(true);
  expect(calls.filter((path) => path.endsWith('/activation'))).toHaveLength(1);
  expect(calls.filter((path) => /\/campaigns\/[^/]+\/sign-in$/.test(path))).toHaveLength(0);
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'ltw_session')).toBe(
    false,
  );
  expect((await ownedCampaigns(page)).campaigns.map((campaign) => campaign.campaignId)).toEqual([
    accepted.campaignId,
  ]);
  const saved = await page.request.get(`${draftApi(name)}/revisions/1`);
  const source = (await saved.json()) as CampaignRevisionView;
  if (!source.revision) throw new Error('Saved source revision missing');
  await enterActivatedGame(page);
  await expect(dockButton(page, 'Players')).toBeVisible();
  const base = `/api/campaigns/${accepted.campaignId}`;
  const session = (await (await page.request.get(`${base}/session`)).json()) as SessionResponse;
  expect(session.campaign.campaignId).toBe(accepted.campaignId);
  expect(session.role).toBe('DM');
  const party = (await (
    await page.request.get(`${base}/presence?perspective=DM`)
  ).json()) as PresenceResponse;
  expect(party.characters.map((row) => row.character.name)).toEqual(
    expect.arrayContaining(['Alena', 'Borin', 'Darya']),
  );
  await expect(page.getByRole('region', { name: 'At the table', exact: true })).toContainText(
    'Alena',
  );
  const playerLink = await invite(page, 'Alena');
  const context = await browser.newContext(),
    player = await context.newPage();
  await openInvitation(player, playerLink);
  await player.getByRole('button', { name: 'Alena', exact: true }).click();
  await player.getByRole('button', { name: 'Full character sheet', exact: true }).click();
  await expect(
    player.getByRole('complementary', { name: 'Entity details', exact: true }),
  ).toContainText('Alena');
  await expect(player.locator('body')).not.toContainText('The Sunken Tower');
  const playerSession = (await (
    await player.request.get(`${base}/session`)
  ).json()) as SessionResponse;
  expect(playerSession.role).toBe('PLAYER');
  expect(playerSession.character?.entityId).toBe(source.revision.identities.entities['alena']);
  // An ordinary authenticated DM fact starts this campaign's prepared quest, not Ravenford's book.
  const quest = source.revision.content.quests[0];
  if (!quest) throw new Error('Prepared quest missing');
  const played = await page.request.post(`${base}/commands`, {
    headers: { Origin: SIGN_IN_ORIGIN },
    data: {
      commandId: 'activation-first-party-fact',
      command: {
        type: 'AddKnowledge',
        scope: { kind: 'PARTY' },
        knowledgeType: 'FACT',
        statement: 'The party accepts the search for the old sluice journal.',
        subjects: [source.revision.identities.entities[quest.activation.subject]],
        knownSince: null,
      },
    },
  });
  expect(played.status()).toBe(200);
  expect(((await played.json()) as { status: string }).status).toBe('accepted');
  const log = (await (
    await player.request.get(`${base}/quests?perspective=PLAYER`)
  ).json()) as QuestListResponse;
  expect(log.quests.map((row) => row.title)).toContain(quest.title);
  // Gate 07, G07-03: the quest reaches the player under its opaque ID, never the authored key.
  expect(log.quests.find((row) => row.title === quest.title)?.questId).toBe(
    source.revision.identities.quests?.[quest.questId],
  );
  expect(JSON.stringify(log)).not.toContain(quest.questId);
  expect(calls.some((path) => path.endsWith('/images/jobs') || path.endsWith('/generation'))).toBe(
    false,
  );
  await context.close();
});

test('Russian activation and game entry keep the campaign language', async ({ page }) => {
  await openActivation(page, 'activation-ru');
  await chooseTextOnly(page);
  await acknowledgeActivation(page);
  await activationConfirm(page).click();
  await expectPublished(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await enterActivatedGame(page, 'en');
  await expect(dockButton(page, 'Игроки')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('activation preserves an existing game cookie and normal entry offers keeping or replacing it', async ({
  page,
}) => {
  await joinAsDm(page, SIGN_IN_CAMPAIGNS.activationGame);
  const cookie = (await page.context().cookies()).find((entry) => entry.name === 'ltw_session');
  if (!cookie) throw new Error('Game cookie missing');
  await openActivation(page, 'activation-coexist');
  await chooseTextOnly(page);
  await acknowledgeActivation(page);
  await activationConfirm(page).click();
  await expectPublished(page);
  const accepted = await activationOf(page, 'activation-coexist');
  expect(
    (await page.context().cookies()).find((entry) => entry.name === 'ltw_session')?.value ===
      cookie.value,
  ).toBe(true);
  await page.getByRole('button', { name: 'Enter campaign', exact: true }).click();
  await expect(accessState(page, WORDS.en.invited)).toBeVisible();
  await takeSeat(page);
  const question = accessState(page, WORDS.en.replaceQuestion);
  await expect(question.getByRole('button', { name: WORDS.en.keep })).toBeFocused();
  await question.getByRole('button', { name: WORDS.en.keep }).click();
  await expect(dockButton(page, 'Players')).toBeVisible();
  expect(
    (await page.context().cookies()).find((entry) => entry.name === 'ltw_session')?.value ===
      cookie.value,
  ).toBe(true);
  await page.goto('/workshop');
  await expect(page.getByRole('region', { name: 'Your campaigns', exact: true })).toContainText(
    'The Bell Beneath the Ice',
  );
  await enterActivatedGame(page, 'en', true);
  await expect(dockButton(page, 'Players')).toBeVisible();
  const current = (await (
    await page.request.get('/api/auth/session', { headers: { Origin: SIGN_IN_ORIGIN } })
  ).json()) as {
    campaignId: string;
  };
  expect(current.campaignId).toBe(accepted.campaignId);
  expect((await page.context().cookies()).some((entry) => entry.name === 'ltw_workshop')).toBe(
    true,
  );
});
