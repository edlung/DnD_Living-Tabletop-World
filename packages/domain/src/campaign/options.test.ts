import { DEFAULT_CAMPAIGN_OPTIONS, type CampaignOptions } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { DM, PLAYER } from '../authoring/testing/world.ts';
import { codeOf } from '../assets/testing/world.ts';
import { visualWorld } from '../visual/testing/world.ts';
import { campaignOptions } from './options.ts';

/**
 * `SetCampaignOptions` (docs/adr/0056-characters-from-the-srd.md §3): the DM's options as a world
 * fact in history, the defaults before any; undo restores the options before, newest first.
 */
const options = (change: Partial<CampaignOptions>): CampaignOptions => ({
  ...DEFAULT_CAMPAIGN_OPTIONS,
  ...change,
});

describe('the campaign options', () => {
  it('start as the defaults and record each change from what was set before', async () => {
    const world = await visualWorld();
    expect(campaignOptions(await world.state())).toEqual(DEFAULT_CAMPAIGN_OPTIONS);
    const milestone = options({ levelsBy: 'milestone', startingLevel: 5 });
    const set = await world.as(DM, { type: 'SetCampaignOptions', options: milestone });
    expect(set.status).toBe('accepted');
    const recorded = (await world.snapshot()).history.filter(
      (event) => event.causation.commandId === set.commandId,
    );
    expect(recorded.map(({ type, payload }) => ({ type, payload }))).toEqual([
      { type: 'CampaignOptionsSet', payload: { from: DEFAULT_CAMPAIGN_OPTIONS, to: milestone } },
    ]);
    expect(campaignOptions(await world.state())).toEqual(milestone);
    await world.verified();
  });

  it('refuses players, options that do not exist, and no change', async () => {
    const world = await visualWorld();
    const set = (value: unknown, actor = DM) =>
      world.as(actor, { type: 'SetCampaignOptions', options: value });
    expect(codeOf(await set(options({ carrying: 'enforced' }), PLAYER))).toBe('FORBIDDEN');
    expect(codeOf(await set(options({ startingLevel: 21 })))).toBe('INVALID_COMMAND');
    expect(codeOf(await set({ ...DEFAULT_CAMPAIGN_OPTIONS, gold: 'lots' }))).toBe(
      'INVALID_COMMAND',
    );
    expect(codeOf(await set(DEFAULT_CAMPAIGN_OPTIONS))).toBe('NO_EFFECT');
  });

  it('are undone newest first, back to what they were', async () => {
    const world = await visualWorld();
    const fixed = await world.as(DM, {
      type: 'SetCampaignOptions',
      options: options({ hitPointsAtLevel: 'fixed' }),
    });
    const enforced = await world.as(DM, {
      type: 'SetCampaignOptions',
      options: options({ hitPointsAtLevel: 'fixed', carrying: 'enforced' }),
    });
    expect(codeOf(await world.undo(fixed.commandId ?? ''))).toBe('UNDO_UNSAFE');
    expect(codeOf(await world.undo(enforced.commandId ?? ''))).toBe('accepted');
    expect(campaignOptions(await world.state())).toEqual(options({ hitPointsAtLevel: 'fixed' }));
    expect(codeOf(await world.undo(fixed.commandId ?? ''))).toBe('accepted');
    expect(campaignOptions(await world.state())).toEqual(DEFAULT_CAMPAIGN_OPTIONS);
    await world.verified();
  });
});
