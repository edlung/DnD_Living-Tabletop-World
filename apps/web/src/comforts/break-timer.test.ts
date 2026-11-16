import { describe, expect, it } from 'vitest';

import {
  advance,
  askLater,
  AWAY_MS,
  breakBegun,
  breakDue,
  breakOver,
  LATER_MS,
  minutesPlayed,
  parseBreak,
  REST_MS,
  SETTLE_MS,
  TICK_MS,
  type BreakState,
} from './break-timer.ts';

/** The DM's count of play since the last break (docs/adr/0072-keepsakes.md §3). */
const MINUTE = 60_000;
const START = 1_800_000_000_000;

/** Plays `minutes` from `state`, looked at every tick. */
function play(state: BreakState | null, minutes: number, from: number, sessionId = 's1') {
  let now = from;
  let next = state;
  for (let passed = 0; passed < minutes * MINUTE; passed += TICK_MS) {
    now += TICK_MS;
    next = advance(next, { sessionId, paused: false, now });
  }
  return { state: next, now };
}
const begun = () => advance(null, { sessionId: 's1', paused: false, now: START });

describe('the count of play since the last break', () => {
  it('counts nothing between sessions and starts with a session', () => {
    expect(advance(null, { sessionId: null, paused: false, now: START })).toBeNull();
    expect(begun()).toMatchObject({ sessionId: 's1', played: 0, pausedAt: null, onBreak: false });
    // The session over: the count is gone with it.
    expect(advance(begun(), { sessionId: null, paused: false, now: START + MINUTE })).toBeNull();
  });

  it('is due after the minutes asked for, and never when the reminder is off', () => {
    const almost = play(begun(), 59, START);
    expect(breakDue(almost.state, 60)).toBe(false);
    const hour = play(almost.state, 1, almost.now);
    expect(breakDue(hour.state, 60)).toBe(true);
    expect(breakDue(hour.state, 90)).toBe(false);
    expect(breakDue(hour.state, 0)).toBe(false);
    expect(breakDue(null, 60)).toBe(false);
    expect(hour.state && minutesPlayed(hour.state)).toBe(60);
  });

  it('holds through a short pause and starts again after a long one', () => {
    const half = play(begun(), 30, START);
    const paused = advance(half.state, { sessionId: 's1', paused: true, now: half.now + MINUTE });
    expect(paused?.pausedAt).toBe(half.now + MINUTE);
    // Looked at again while paused: the pause keeps its beginning.
    const still = advance(paused, { sessionId: 's1', paused: true, now: half.now + 2 * MINUTE });
    expect(still?.pausedAt).toBe(half.now + MINUTE);
    expect(breakDue({ ...(still as BreakState), played: 61 * MINUTE }, 60)).toBe(false);
    const short = advance(still, {
      sessionId: 's1',
      paused: false,
      now: half.now + MINUTE + REST_MS - 1,
    });
    expect(short).toMatchObject({ played: 30 * MINUTE, pausedAt: null });
    const long = advance(still, {
      sessionId: 's1',
      paused: false,
      now: half.now + MINUTE + REST_MS,
    });
    expect(long).toMatchObject({ played: 0, pausedAt: null });
  });

  it('starts again when nobody watched: a laptop closed, a campaign left open overnight', () => {
    const half = play(begun(), 30, START);
    const brief = advance(half.state, {
      sessionId: 's1',
      paused: false,
      now: half.now + AWAY_MS - 1,
    });
    expect(brief?.played).toBe(30 * MINUTE + AWAY_MS - 1);
    const away = advance(half.state, { sessionId: 's1', paused: false, now: half.now + AWAY_MS });
    expect(away?.played).toBe(0);
    // A clock set back counts nothing and breaks nothing.
    const back = advance(half.state, { sessionId: 's1', paused: false, now: half.now - MINUTE });
    expect(back?.played).toBe(30 * MINUTE);
  });

  it('starts again with another session', () => {
    const hour = play(begun(), 60, START);
    const next = advance(hour.state, { sessionId: 's2', paused: false, now: hour.now + MINUTE });
    expect(next).toMatchObject({ sessionId: 's2', played: 0 });
  });

  it('asks again a quarter of an hour of play after “later”, and says the time truly', () => {
    const hour = play(begun(), 60, START);
    const later = askLater(hour.state as BreakState);
    expect(breakDue(later, 60)).toBe(false);
    const almost = play(later, LATER_MS / MINUTE - 1, hour.now);
    expect(breakDue(almost.state, 60)).toBe(false);
    const again = play(almost.state, 1, almost.now);
    expect(breakDue(again.state, 60)).toBe(true);
    expect(again.state && minutesPlayed(again.state)).toBe(75);
    // A rest taken meanwhile forgets the putting off with the count.
    const paused = advance(later, { sessionId: 's1', paused: true, now: hour.now + MINUTE });
    const rested = advance(paused, {
      sessionId: 's1',
      paused: false,
      now: hour.now + MINUTE + REST_MS,
    });
    expect(rested).toMatchObject({ played: 0, askAt: 0 });
  });

  it('keeps a break on while the game is paused, and ends it when the game plays again', () => {
    const hour = play(begun(), 60, START);
    const cast = { kind: 'dice' } as const;
    const resting = breakBegun(hour.state as BreakState, { shown: true, resume: cast }, hour.now);
    expect(resting).toMatchObject({ onBreak: true, shown: true, resume: cast, pausedAt: hour.now });
    expect(breakDue(resting, 60)).toBe(false);
    // The pause just asked for has not been read back yet: the break is not over for that.
    const early = advance(resting, { sessionId: 's1', paused: false, now: hour.now + 1_000 });
    expect(early).toMatchObject({ onBreak: true, resume: cast });
    const seen = advance(early, { sessionId: 's1', paused: true, now: hour.now + 2_000 });
    expect(seen).toMatchObject({ onBreak: true, awaited: false, pausedAt: hour.now });
    // Resumed — from the card or from the Session sheet, even a moment later: the break is over
    // and the count starts again.
    const back = advance(seen, { sessionId: 's1', paused: false, now: hour.now + 3_000 });
    // A pause that never came back from the table is not waited for long.
    expect(
      advance(resting, { sessionId: 's1', paused: false, now: hour.now + SETTLE_MS }),
    ).toMatchObject({ onBreak: false });
    expect(back).toMatchObject({
      played: 0,
      askAt: 0,
      onBreak: false,
      shown: false,
      resume: null,
      pausedAt: null,
    });
    expect(breakOver(resting, hour.now + 3_000)).toEqual(back);
  });

  it('is a break all the same where no screen was told: nothing to show again', () => {
    const hour = play(begun(), 60, START);
    const quiet = breakBegun(hour.state as BreakState, { shown: false, resume: null }, hour.now);
    expect(quiet).toMatchObject({ onBreak: true, shown: false, resume: null });
  });

  it('says the minutes in fives', () => {
    const state = begun() as BreakState;
    expect(minutesPlayed({ ...state, played: 61 * MINUTE })).toBe(60);
    expect(minutesPlayed({ ...state, played: 73 * MINUTE })).toBe(75);
    expect(minutesPlayed({ ...state, played: 0 })).toBe(5);
  });
});

describe('what the browser kept of the count', () => {
  it('reads back what was written and nothing that is not a count', () => {
    const state = breakBegun(
      begun() as BreakState,
      { shown: true, resume: { kind: 'scene', locationId: null } },
      START,
    );
    expect(parseBreak(JSON.stringify(state))).toEqual(state);
    for (const text of [
      null,
      '',
      'not json',
      '[]',
      '{"sessionId":7,"played":1,"seenAt":1}',
      '{"sessionId":"s1","played":-1,"seenAt":1}',
      '{"sessionId":"s1","played":"1","seenAt":1}',
    ]) {
      expect(parseBreak(text), String(text)).toBeNull();
    }
    // A cast this build does not know is no cast to show again.
    expect(
      parseBreak(
        JSON.stringify({
          ...state,
          resume: { kind: 'hologram' },
          pausedAt: 'x',
          onBreak: 'yes',
          shown: 1,
          awaited: 'no',
        }),
      ),
    ).toEqual({
      ...state,
      resume: null,
      pausedAt: null,
      onBreak: false,
      shown: false,
      awaited: false,
    });
    // What an earlier build kept has no putting off: none is read.
    expect(parseBreak(JSON.stringify({ ...state, askAt: undefined }))).toEqual(state);
  });
});
