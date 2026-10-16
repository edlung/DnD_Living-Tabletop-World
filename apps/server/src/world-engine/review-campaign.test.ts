import { createCombatEngine } from '@ltw/combat';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  commandSubmissionSchema,
} from '@ltw/domain';
import { scriptedDice, skillCheckPort } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import { MIDDLE_ENTROPY, seededEngine } from '../testing/ravenford-app.ts';
import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from './ravenford-seed.ts';
import {
  ReviewCampaignError,
  loadReviewCampaignSeed,
  seedReviewCampaign,
} from './review-campaign.ts';

/** The deployment's review campaign (docs/adr/0037-deployment.md, part B notes). */
const emptyEngine = () =>
  new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
    checks: skillCheckPort(scriptedDice([])),
    combat: createCombatEngine(),
    entropy: MIDDLE_ENTROPY,
  });

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const PLAYER = { actorId: 'player:review-test', kind: 'user' } as const;

describe('review campaign', () => {
  it('seeds the Russian Ravenford through the World Engine with every seat open', async () => {
    const engine = emptyEngine();
    const summary = await seedReviewCampaign(engine);

    expect(summary).toMatchObject({
      campaignId: 'ravenford',
      name: 'Пропавший караван',
      language: 'ru',
      duplicate: 0,
      openSeats: ['elowen-starwhisper'],
    });
    const state = (await engine.load('ravenford'))?.state;
    // The fixture's party history stands; the seat it gave a persona is free again.
    expect(state?.roster.size).toBe(0);
    expect(state?.commands.get('ravenford.review.release.elowen-starwhisper')?.commandType).toBe(
      'ReleaseCharacter',
    );
    expect(summary.version).toBe(state?.version);
    expect(summary.entities).toBe(state?.entities.size);
    expect(summary.accepted).toBe((await loadReviewCampaignSeed()).submissions.length);
  });

  it('keeps every fixture command and its ID, then the DM releases the persona seat', async () => {
    const fixture = (await loadRavenfordSeed(RAVENFORD_RU_FIXTURES_DIR)).submissions.map((input) =>
      commandSubmissionSchema.parse(input),
    );
    const review = await loadReviewCampaignSeed();

    expect(review.submissions.slice(0, fixture.length)).toEqual(fixture);
    expect(review.submissions.slice(fixture.length)).toEqual([
      {
        commandId: 'ravenford.review.release.elowen-starwhisper',
        campaignId: 'ravenford',
        actor: DM,
        command: { type: 'ReleaseCharacter', characterId: 'elowen-starwhisper' },
      },
    ]);
  });

  it('is idempotent: a second run finds every command present', async () => {
    const engine = emptyEngine();
    const first = await seedReviewCampaign(engine);
    const second = await seedReviewCampaign(engine);

    expect(second).toEqual({ ...first, accepted: 0, duplicate: first.accepted });
  });

  it('never takes a seat back: a rerun after a player joined leaves the seat to the player', async () => {
    const engine = emptyEngine();
    await seedReviewCampaign(engine);
    await engine.execute({
      commandId: 'review-test.seat',
      campaignId: 'ravenford',
      actor: DM,
      command: {
        type: 'AssignCharacter',
        characterId: 'elowen-starwhisper',
        playerActorId: PLAYER.actorId,
      },
    });

    const rerun = await seedReviewCampaign(engine);

    expect(rerun).toMatchObject({ accepted: 0, openSeats: [] });
    const state = (await engine.load('ravenford'))?.state;
    expect(state?.roster.get('elowen-starwhisper')).toBe(PLAYER.actorId);
  });

  it('refuses a database that holds the English Ravenford', async () => {
    const english = await seededEngine();

    await expect(seedReviewCampaign(english)).rejects.toThrow(ReviewCampaignError);
    await expect(seedReviewCampaign(english)).rejects.toThrow(/COMMAND_ID_CONFLICT/);
  });

  it('lets an invited player take the open seat and explore in Russian', async () => {
    const engine = emptyEngine();
    await seedReviewCampaign(engine);
    const elowen = 'elowen-starwhisper';
    const run = (commandId: string, actor: typeof DM | typeof PLAYER, command: object) =>
      engine.execute({ commandId, campaignId: 'ravenford', actor, command });

    // The sign-in seats an invited player with this command (docs/adr/0036 §2), then the
    // journey of deploy/verify/sign-in-journey.sh: ask Mira, take the road, inspect the site.
    const results = [
      await run('review-test.seat', DM, {
        type: 'AssignCharacter',
        characterId: elowen,
        playerActorId: PLAYER.actorId,
      }),
      await run('review-test.ask', PLAYER, {
        type: 'AskAbout',
        characterId: elowen,
        npcId: 'mira-vale',
        topicId: 'guild-caravan',
      }),
      await run('review-test.road', PLAYER, {
        type: 'EnterLocation',
        characterId: elowen,
        locationId: 'old-trade-road',
      }),
      await run('review-test.site', PLAYER, {
        type: 'EnterLocation',
        characterId: elowen,
        locationId: 'abandoned-caravan-site',
      }),
      await run('review-test.inspect', PLAYER, {
        type: 'ExamineEntity',
        characterId: elowen,
        entityId: 'abandoned-caravan-site',
        method: 'inspect',
      }),
    ];

    expect(results.map(({ status }) => status)).toEqual(Array(5).fill('accepted'));
    const state = (await engine.load('ravenford'))?.state;
    const statements = [...(state?.knowledge.values() ?? [])].map(({ statement }) => statement);
    expect(statements).toContain(
      'Сломанные повозки и разбросанные ящики заполняют придорожную поляну: здесь напали на гильдейский караван.',
    );
  });
});
