import type { AssetLineageResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  answered,
  IDLE,
  interrupted,
  isBusy,
  lineageRead,
  retried,
  sent,
  type ImageCommandState,
} from './command-state.ts';

/**
 * The DM's one image command at a time (`command-state.ts`): the controls come back only once a
 * lineage read that started after the world's answer arrives — never on the answer itself, while
 * the list still shows the card the DM pressed — and an interrupted command keeps them until the
 * DM retries it, from wherever the DM is.
 */
const empty: AssetLineageResponse = { requests: [], assets: [], canonical: [], descriptions: [] };
const later: AssetLineageResponse = { ...empty, canonical: [{ entityId: 'x', assetId: 'y' }] };
const approve = { place: 'sheet', subject: 'Approve: At night of North Gate', target: 'a~asset' };
const success = (lineage: AssetLineageResponse) =>
  lineage === later ? 'Approved, as the new list shows' : 'Approved, from a list read too early';

describe('an image command', () => {
  it('holds every control from the press until a lineage read after the answer', () => {
    const busy = sent(IDLE, approve);
    expect(busy).toMatchObject({ id: 1, status: 'busy', place: 'sheet', target: 'a~asset' });
    expect(isBusy(busy)).toBe(true);
    // Four lineage reads had started when the world accepted it.
    const settling = answered(busy, { refusal: null }, 4);
    expect(settling).toMatchObject({ status: 'settling', accepted: true, answeredAt: 4 });
    expect(isBusy(settling)).toBe(true);
    // A read that started before the answer still shows the card: nothing comes back.
    for (const read of [2, 4]) {
      expect(lineageRead(settling, read, empty, success)).toBe(settling);
    }
    const done = lineageRead(settling, 5, later, success);
    expect(done).toMatchObject({ status: 'done', message: 'Approved, as the new list shows' });
    expect(isBusy(done)).toBe(false);
    // A read after that changes nothing more.
    expect(lineageRead(done, 6, empty, success)).toBe(done);
  });

  it('shows a refusal only when the list shows the picture as it is', () => {
    const settling = answered(sent(IDLE, approve), { refusal: 'This picture changed.' }, 1);
    expect(settling).toMatchObject({ status: 'settling', accepted: false });
    expect(isBusy(settling)).toBe(true);
    expect(lineageRead(settling, 2, later, success)).toMatchObject({
      status: 'done',
      accepted: false,
      message: 'This picture changed.',
    });
  });

  it('keeps the controls after a lost answer until the DM retries it, from anywhere', () => {
    const uncertain = interrupted(sent(IDLE, approve));
    expect(uncertain.status).toBe('uncertain');
    expect(isBusy(uncertain)).toBe(true);
    // A lineage read is no answer: the change may or may not have been made.
    expect(lineageRead(uncertain, 9, later, success)).toBe(uncertain);
    const again = retried(uncertain, 'details:captain-thorne');
    expect(again).toMatchObject({ id: 1, status: 'busy', place: 'details:captain-thorne' });
    expect(again.subject).toBe(approve.subject);
    // Its words show there, naming the picture with its entity.
    const done = lineageRead(answered(again, { refusal: null }, 9), 10, later, (_l, elsewhere) =>
      elsewhere ? 'Approved: At night of North Gate.' : 'Approved: At night.',
    );
    expect(done).toMatchObject({
      status: 'done',
      place: 'details:captain-thorne',
      given: 'sheet',
      message: 'Approved: At night of North Gate.',
    });
  });

  it('numbers each new command once, and moves only from the state each step expects', () => {
    const first = lineageRead(
      answered(sent(IDLE, approve), { refusal: null }, 0),
      1,
      later,
      success,
    );
    const second = sent(first, { ...approve, target: 'b~asset' });
    expect([first.id, second.id]).toEqual([1, 2]);
    expect(second).toMatchObject({ status: 'busy', message: null, accepted: false });
    const idle: ImageCommandState = IDLE;
    expect(answered(idle, { refusal: null }, 3)).toBe(idle);
    expect(interrupted(idle)).toBe(idle);
    expect(retried(second, 'sheet')).toBe(second);
  });
});
