import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELIBERATE_MS, DeliberateChoice } from './deliberate-choice.ts';

/**
 * Replacing a sign-in is taken only deliberately (docs/STAGE_340_DESIGN.md "Part B review
 * fixes"): after the page has been visible and focused for half a second without a break, and
 * after a pointer or key since the question appeared. The rest of a double click, a held key or a
 * click meant for what was there a moment ago never takes it.
 */
describe('a deliberate choice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const choice = (present = true) => {
    const changes: boolean[] = [];
    const guard = new DeliberateChoice({
      present,
      onChange: (armed) => changes.push(armed),
    });
    return { guard, changes };
  };

  it('waits half a second of a visible, focused page, and a pointer or key', () => {
    expect(DELIBERATE_MS).toBe(500);
    const { guard, changes } = choice();
    // The rest of a double click, at once: too soon.
    guard.interaction();
    expect(guard.armed).toBe(false);
    vi.advanceTimersByTime(DELIBERATE_MS - 1);
    expect(guard.armed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(guard.armed).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('never arms without a pointer or key, however long the question shows', () => {
    const { guard, changes } = choice();
    vi.advanceTimersByTime(60_000);
    expect(guard.armed).toBe(false);
    guard.interaction();
    expect(guard.armed).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('starts over when the page is hidden or loses focus, a pointer or key included', () => {
    const { guard, changes } = choice();
    vi.advanceTimersByTime(DELIBERATE_MS);
    guard.interaction();
    expect(guard.armed).toBe(true);
    guard.presence(false);
    expect(guard.armed).toBe(false);
    // Nothing counts while the page is away.
    guard.interaction();
    vi.advanceTimersByTime(DELIBERATE_MS);
    expect(guard.armed).toBe(false);
    guard.presence(true);
    vi.advanceTimersByTime(DELIBERATE_MS);
    expect(guard.armed).toBe(false);
    guard.interaction();
    expect(guard.armed).toBe(true);
    expect(changes).toEqual([true, false, true]);
  });

  it('waits for a page that was not visible and focused when the question appeared', () => {
    const { guard } = choice(false);
    guard.interaction();
    vi.advanceTimersByTime(DELIBERATE_MS * 4);
    expect(guard.armed).toBe(false);
    guard.presence(true);
    guard.interaction();
    vi.advanceTimersByTime(DELIBERATE_MS - 1);
    expect(guard.armed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(guard.armed).toBe(true);
  });

  it('a brief loss of focus restarts the half second', () => {
    const { guard } = choice();
    guard.interaction();
    vi.advanceTimersByTime(DELIBERATE_MS - 100);
    guard.presence(false);
    guard.presence(true);
    guard.interaction();
    vi.advanceTimersByTime(DELIBERATE_MS - 1);
    expect(guard.armed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(guard.armed).toBe(true);
  });

  it('reports nothing once closed', () => {
    const { guard, changes } = choice();
    guard.interaction();
    guard.close();
    vi.advanceTimersByTime(DELIBERATE_MS * 2);
    guard.presence(false);
    guard.presence(true);
    expect(guard.armed).toBe(false);
    expect(changes).toEqual([]);
  });
});
