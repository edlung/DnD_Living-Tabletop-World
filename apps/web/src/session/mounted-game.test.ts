import type { SessionResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { MountedGameIdentity } from './mounted-game.ts';

const identity = (actorId: string, campaignId = 'ravenford'): SessionResponse => ({
  actorId,
  role: 'DM',
  campaign: { campaignId, name: 'The river', language: 'en' },
  character: null,
  perspectives: [],
});

describe('the identity shown by one game connection', () => {
  it('always binds the mounted campaign before any identity has loaded', () => {
    const mounted = new MountedGameIdentity('ravenford');
    expect(mounted.read()).toEqual({ campaignId: 'ravenford' });
  });

  it('retains the first observed actor rather than a newer same-campaign cookie identity', () => {
    const mounted = new MountedGameIdentity('ravenford');
    mounted.observe(identity('first-dm'));
    mounted.observe(identity('replacement-dm'));
    expect(mounted.read()).toEqual({ campaignId: 'ravenford', actorId: 'first-dm' });
  });

  it('does not take an actor from a response for another mounted campaign', () => {
    const mounted = new MountedGameIdentity('ravenford');
    mounted.observe(identity('foreign-dm', 'another-game'));
    expect(mounted.read()).toEqual({ campaignId: 'ravenford' });
    mounted.observe(identity('right-dm'));
    expect(mounted.read()).toEqual({ campaignId: 'ravenford', actorId: 'right-dm' });
  });

  it('leaves an already-open question snapshot unchanged when the first identity arrives later', () => {
    const mounted = new MountedGameIdentity('ravenford');
    const question = mounted.read();
    mounted.observe(identity('loaded-after-question'));
    expect(question).toEqual({ campaignId: 'ravenford' });
    expect(mounted.read()).toEqual({ campaignId: 'ravenford', actorId: 'loaded-after-question' });
    expect(JSON.stringify(mounted)).toBe('{}');
  });
});
