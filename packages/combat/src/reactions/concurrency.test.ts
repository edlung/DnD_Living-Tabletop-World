import type { CommandResult } from '@ltw/contracts';
import type { Actor } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { rivalEngine } from '../testing/racing.ts';
import {
  SEREN,
  SEREN_PLAYER,
  addSeren,
  closeWindow,
  counterspell,
  ignore,
  shamanCastsAtElowen,
  withSeren,
} from '../testing/reactions.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  PLAYER,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';
import { verifyHistory } from '../testing/verify.ts';

/**
 * Racing answers (docs/adr/0016-reaction-engine.md §2). The campaign stream
 * is the only order: the command recorded second is decided again against
 * the newer state. A rival engine on the same store plays a second server
 * process; its store lets the other command commit just before its append.
 */
async function ambushWindow(withSecondCandidate = false) {
  const world = await roadWorld();
  if (withSecondCandidate) await addSeren(world);
  await startAmbush(
    world,
    withSecondCandidate ? [17, 3, 2, 1, 15, 5] : undefined,
    withSecondCandidate ? withSeren() : undefined,
  );
  const { windowId } = await shamanCastsAtElowen(world);
  const rival = rivalEngine(world.store, 7);
  await rival.engine.load(CAMPAIGN); // the rival decides on the open window
  return { world, windowId, rival };
}

let counter = 0;
const asRival = (
  rival: ReturnType<typeof rivalEngine>,
  actor: Actor,
  command: Record<string, unknown>,
) => {
  counter += 1;
  return rival.engine.execute({
    commandId: `rival.${String(counter)}`,
    campaignId: CAMPAIGN,
    actor,
    command,
  });
};
const spellsCast = async (world: RoadWorld, spellId: string) =>
  ((await world.store.loadStream(CAMPAIGN))?.events ?? []).filter(
    (e) => e.type === 'SpellCast' && e.payload.spellId === spellId,
  ).length;

describe('an answer racing the DM’s close', () => {
  it('the answer is recorded first: the close is decided again and finds the window closed', async () => {
    const { world, windowId, rival } = await ambushWindow();
    world.roll(20, 5);
    rival.racing.interleave(() => world.submit(counterspell(ELOWEN, windowId)));
    const close = await asRival(rival, DM, closeWindow(windowId));
    expect(rival.racing.conflicts).toBe(1);
    expect(codeOf(close)).toBe('REACTION_WINDOW_CLOSED');
    expect((await world.state()).reactionWindows.get(windowId)?.status).toBe('countered');
    expect(await spellsCast(world, 'ashen-bolt')).toBe(0);
    await verifyHistory(world);
  });

  it('the close is recorded first: the answer is decided again and finds the window closed', async () => {
    const { world, windowId, rival } = await ambushWindow();
    rival.racing.interleave(() => world.dm(closeWindow(windowId)));
    const answer = await asRival(rival, PLAYER, counterspell(ELOWEN, windowId));
    expect(rival.racing.conflicts).toBe(1);
    expect(codeOf(answer)).toBe('REACTION_WINDOW_CLOSED');
    const state = await world.state();
    expect(state.reactionWindows.get(windowId)).toMatchObject({
      status: 'proceeded',
      candidates: [{ entityId: ELOWEN, response: 'expired' }],
    });
    expect(state.characterSheets.get(ELOWEN)?.spellSlots.expended[2]).toBe(0);
    expect(await spellsCast(world, 'ashen-bolt')).toBe(1);
    await verifyHistory(world);
  });
});

describe('answers from two processes', () => {
  it('the same candidate twice: exactly one answer counts', async () => {
    const { world, windowId, rival } = await ambushWindow(true);
    rival.racing.interleave(() => world.submit(ignore(ELOWEN, windowId)));
    const second = await asRival(rival, PLAYER, counterspell(ELOWEN, windowId));
    expect(codeOf(second)).toBe('ALREADY_RESPONDED');
    const state = await world.state();
    expect(state.characterSheets.get(ELOWEN)?.spellSlots.expended[2]).toBe(0);
    expect(state.reactionWindows.get(windowId)?.candidates[0]).toEqual({
      entityId: ELOWEN,
      response: 'declined',
    });
    await verifyHistory(world);
  });

  it('two candidates at once: both count, and the spell resolves exactly once', async () => {
    const { world, windowId, rival } = await ambushWindow(true);
    rival.racing.interleave(() => world.submit(ignore(ELOWEN, windowId)));
    const seren = await asRival(rival, SEREN_PLAYER, ignore(SEREN, windowId));
    expect(rival.racing.conflicts).toBe(1);
    expect(codeOf(seren)).toBe('accepted');
    expect((await world.state()).reactionWindows.get(windowId)?.status).toBe('proceeded');
    expect(await spellsCast(world, 'ashen-bolt')).toBe(1);
    await verifyHistory(world);
  });

  it('a burst of answers on both engines: one is accepted, the rest are refused', async () => {
    const { world, windowId, rival } = await ambushWindow();
    const results: CommandResult[] = await Promise.all([
      world.submit(counterspell(ELOWEN, windowId)),
      asRival(rival, PLAYER, counterspell(ELOWEN, windowId)),
      world.submit(ignore(ELOWEN, windowId)),
      asRival(rival, PLAYER, ignore(ELOWEN, windowId)),
      asRival(rival, DM, closeWindow(windowId)),
    ]);
    const codes = results.map(codeOf);
    expect(codes.filter((code) => code === 'accepted')).toHaveLength(1);
    expect(
      codes
        .filter((code) => code !== 'accepted')
        .every((code) => code === 'REACTION_WINDOW_CLOSED'),
    ).toBe(true);
    expect((await world.state()).reactionWindows.get(windowId)?.status).not.toBe('open');
    await verifyHistory(world);
  });
});
