import { describe, expect, it } from 'vitest';

import { PLAY_SESSIONS, accountingSession } from './journal.ts';

/**
 * The session class a request start records (design §1; ADR 0032, checkpoint C): runtime charges
 * the captured play session; a trusted evaluation composition charges its registered run, never
 * the world's session; a request begun without a session is local only in both.
 */
describe('accountingSession', () => {
  it('charges the captured play session at runtime', () => {
    expect(accountingSession(PLAY_SESSIONS, 'ravenford-s1')).toEqual({
      class: 'play',
      sessionId: 'ravenford-s1',
    });
  });

  it('charges the registered run in evaluation, whatever the world’s session', () => {
    const binding = { class: 'evaluation', runId: 'run-7' } as const;
    expect(accountingSession(binding, 'ravenford-s1')).toEqual({
      class: 'evaluation',
      runId: 'run-7',
    });
  });

  it('keeps a request without a session local only', () => {
    expect(accountingSession(PLAY_SESSIONS, null)).toBeNull();
    expect(accountingSession({ class: 'evaluation', runId: 'run-7' }, null)).toBeNull();
  });
});
