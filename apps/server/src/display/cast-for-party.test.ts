import { describe, expect, it } from 'vitest';

import { seededEngine } from '../testing/ravenford-app.ts';
import { castForParty } from './display-routes.ts';

/**
 * The cast as anyone below the DM reads it (docs/adr/0042-table-display.md §5, ADR 0044 §5): the
 * join card is the table's screen's only; a player's shared view online reads a dark screen then.
 */
describe('the cast below the DM', () => {
  it('gives the join card to a table display only', async () => {
    const snapshot = await (await seededEngine()).load('ravenford');
    if (!snapshot) throw new Error('no Ravenford');
    const { state } = snapshot;
    const display = { actorId: 'display:living-room', kind: 'display' } as const;
    const player = { actorId: 'player:elowen', kind: 'user' } as const;
    expect(castForParty(state, display, { kind: 'join' }, null).cast).toEqual({ kind: 'join' });
    expect(castForParty(state, player, { kind: 'join' }, null).cast).toEqual({ kind: 'blank' });
    expect(castForParty(state, player, { kind: 'dice' }, null).cast).toEqual({ kind: 'dice' });
  });
});
