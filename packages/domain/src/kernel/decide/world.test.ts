import { MAX_ABS_WORLD_TIME } from '@ltw/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  START,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../testing/kernel-harness.ts';

let harness: Harness;

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
});

describe('campaign creation', () => {
  it('makes the creating user the DM and starts the clock', async () => {
    const state = await harness.state();

    expect(state.campaign).toEqual({
      campaignId: 'test-campaign',
      name: 'Test',
      worldName: 'Testland',
      startsAt: START,
      dmActorId: 'dm-1',
      language: 'en',
    });
    expect(state.clock).toBe(START);
  });

  it('reads a history that never recorded a language as English, and writes none for English', async () => {
    const history = await harness.history();
    const created = history.find((event) => event.type === 'CampaignCreated');
    expect(created?.payload).not.toHaveProperty('language');
  });

  it('records a chosen language once, as the campaign language', async () => {
    const russian = createHarness();
    expectAccepted(
      await russian.submit({
        type: 'CreateCampaign',
        name: 'Пропавший караван',
        worldName: 'Равенфорд',
        startsAt: START,
        language: 'ru',
      }),
    );
    expect((await russian.state()).campaign?.language).toBe('ru');
    const created = (await russian.history()).find((event) => event.type === 'CampaignCreated');
    expect(created?.payload).toMatchObject({ language: 'ru' });
  });

  it('rejects an unknown language as invalid input', async () => {
    const odd = createHarness();
    const result = await odd.submit({
      type: 'CreateCampaign',
      name: 'X',
      worldName: 'Y',
      startsAt: START,
      language: 'de',
    });
    expect(result.status).toBe('rejected');
  });
});

describe('scenes', () => {
  it('runs one scene at a time, at a usable location, with world-time bounds', async () => {
    expectAccepted(
      await harness.submit({
        type: 'StartScene',
        sceneId: 's1',
        title: 'Market',
        locationId: 'square',
      }),
    );
    expectRejected(
      await harness.submit({ type: 'StartScene', sceneId: 's2', title: 'Inn', locationId: 'inn' }),
      'SCENE_ALREADY_ACTIVE',
    );
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 900 }));
    expectAccepted(await harness.submit({ type: 'EndScene', sceneId: 's1' }));

    const state = await harness.state();
    expect(state.activeSceneId).toBeNull();
    expect(state.scenes.get('s1')).toEqual({
      sceneId: 's1',
      title: 'Market',
      locationId: 'square',
      startedAt: START,
      endedAt: START + 900,
    });
  });

  it('rejects unknown, ended, reused, and misplaced scenes', async () => {
    expectRejected(await harness.submit({ type: 'EndScene', sceneId: 'nope' }), 'SCENE_NOT_FOUND');
    expectAccepted(
      await harness.submit({ type: 'StartScene', sceneId: 's1', title: 'A', locationId: 'square' }),
    );
    expectAccepted(await harness.submit({ type: 'EndScene', sceneId: 's1' }));
    expectRejected(await harness.submit({ type: 'EndScene', sceneId: 's1' }), 'SCENE_NOT_ACTIVE');
    expectRejected(
      await harness.submit({ type: 'StartScene', sceneId: 's1', title: 'B', locationId: 'square' }),
      'ID_ALREADY_USED',
    );
    expectRejected(
      await harness.submit({
        type: 'StartScene',
        sceneId: 'npc',
        title: 'B',
        locationId: 'square',
      }),
      'ID_ALREADY_USED',
    );
    expectRejected(
      await harness.submit({ type: 'StartScene', title: 'C', locationId: 'npc' }),
      'NOT_A_LOCATION',
    );
  });
});

describe('world clock', () => {
  it('advances by a duration or to a later time', async () => {
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 3600 }));
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', to: START + 86_400 }));

    expect((await harness.state()).clock).toBe(START + 86_400);
    expect((await harness.history()).at(-1)?.payload).toEqual({
      from: START + 3600,
      to: START + 86_400,
    });
  });

  it('never moves backward, stands still, or leaves the supported range', async () => {
    expectRejected(
      await harness.submit({ type: 'AdvanceWorldTime', to: START }),
      'TEMPORAL_CONFLICT',
    );
    expectRejected(
      await harness.submit({ type: 'AdvanceWorldTime', to: START - 1 }),
      'TEMPORAL_CONFLICT',
    );
    expectRejected(
      await harness.submit({ type: 'AdvanceWorldTime', by: MAX_ABS_WORLD_TIME }),
      'TEMPORAL_CONFLICT',
    );
  });

  it('rejects malformed advances at the schema boundary', async () => {
    for (const command of [
      { type: 'AdvanceWorldTime' },
      { type: 'AdvanceWorldTime', by: 1, to: START + 1 },
      { type: 'AdvanceWorldTime', by: 0 },
      { type: 'AdvanceWorldTime', by: 1.5 },
    ]) {
      expectRejected(await harness.submit(command), 'INVALID_COMMAND');
    }
  });
});
