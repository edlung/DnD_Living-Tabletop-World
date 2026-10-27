import { createCombatEngine } from '@ltw/combat';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  commandSubmissionSchema,
  entityPresentationAt,
  holderPerspective,
} from '@ltw/domain';
import { scriptedDice, skillCheckPort } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import { InMemoryAssetContentStore, contentHashOf } from '../assets/content-store.ts';
import { loadCuratedSet } from '../images/curated-set.ts';
import { createLogger } from '../platform/logging/logger.ts';
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

/** With the curated pictures a seed issues four commands for each of the 51 (45 files). */
const SLOW_MS = 60_000;

describe('review campaign', { timeout: SLOW_MS }, () => {
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
    expect(summary.pictures).toBeNull();
  });

  it('brings the curated pictures, approved for players by the DM; a rerun finds them', async () => {
    const engine = emptyEngine();
    const set = await loadCuratedSet();
    const contents = new InMemoryAssetContentStore();
    const pictures = { contents, set, logger: createLogger({ service: 'test', level: 'silent' }) };
    const total = set.entries.reduce((sum, entry) => sum + entry.entityIds.length, 0);

    const first = await seedReviewCampaign(engine, { pictures });

    expect(first.pictures).toEqual({ imported: total, present: 0, skipped: 0 });
    const snapshot = await engine.load('ravenford');
    if (!snapshot) throw new Error('missing campaign');
    const assets = [...snapshot.state.assets.assets.values()];
    expect(assets).toHaveLength(total);
    for (const asset of assets) {
      expect(asset).toMatchObject({
        status: asset.variant === 'reference' ? 'CANONICAL' : 'APPROVED',
        audience: 'players',
        generator: { provider: 'curated', model: set.model },
      });
      const stored = await contents.get('ravenford', asset.contentHash);
      expect(stored && contentHashOf(stored.bytes)).toBe(asset.contentHash);
    }
    // The seat is open and the pictures wait for whoever takes it: Elowen's player, once invited,
    // sees the market square's picture and Mira's figure; nothing of the caravan site yet.
    expect(first.openSeats).toEqual(['elowen-starwhisper']);
    const elowen = holderPerspective(snapshot.state, {
      kind: 'CHARACTER',
      characterId: 'elowen-starwhisper',
    });
    const shown = (id: string) => entityPresentationAt(snapshot, elowen, id, null)?.presentation;
    const hash = (file: string) =>
      `sha256:${set.entries.find((entry) => entry.file === file)?.sha256 ?? ''}`;
    expect(shown('market-square')?.image?.contentHash).toBe(hash('market-square.webp'));
    expect(shown('mira-vale')?.figure?.contentHash).toBe(hash('mira-vale--figure.webp'));
    expect(shown('location-f3b82c8b')).toBeUndefined();

    const rerun = await seedReviewCampaign(engine, { pictures });
    expect(rerun).toEqual({
      ...first,
      accepted: 0,
      duplicate: first.accepted,
      pictures: { imported: 0, present: total, skipped: 0 },
    });
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
    await expect(seedReviewCampaign(english)).rejects.toThrow(
      /COMMAND_ID_CONFLICT: this database holds the en Ravenford, not the ru one/,
    );
  });

  it('tells the operator that a database seeded by an older fixture revision needs a reset', async () => {
    // The review campaign as the fixtures were before Gate 06 gave the Shaman an opaque ID.
    const engine = emptyEngine();
    const { submissions } = await loadReviewCampaignSeed();
    for (const submission of submissions) {
      const older: unknown = JSON.parse(
        JSON.stringify(submission).replaceAll('creature-ae08be99', 'goblin-shaman'),
      );
      expect((await engine.execute(older)).status).toBe('accepted');
    }

    const refused = seedReviewCampaign(engine);
    await expect(refused).rejects.toThrow(ReviewCampaignError);
    await expect(refused).rejects.toThrow(
      /COMMAND_ID_CONFLICT: this database was seeded by an older fixture revision .*Reset required.*deploy\/RUNBOOK\.md, section 12/,
    );
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
        locationId: 'location-f3b82c8b',
      }),
      await run('review-test.inspect', PLAYER, {
        type: 'ExamineEntity',
        characterId: elowen,
        entityId: 'location-f3b82c8b',
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
