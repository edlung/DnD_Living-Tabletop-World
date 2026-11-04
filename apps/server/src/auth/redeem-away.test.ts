import { describe, expect, it } from 'vitest';

import type { CampaignMoves } from '../campaigns/move/moves.ts';
import { SEREN, signInTable } from '../testing/sign-in.ts';
import { redeemInvitation } from './sign-in.ts';
import { hashToken } from './tokens.ts';

/**
 * An invitation to a campaign played on another server (docs/adr/0061-local-mode.md §5) is not
 * redeemed here, and nothing of it is written: a seat claimed or an invitation used while away
 * could never take the package's rows back.
 */
const AWAY: CampaignMoves = {
  awayOf: () => Promise.resolve({ destination: 'MacBook', movedAt: '2026-11-04T09:00:00.000Z' }),
};

describe('redeeming an invitation of an away campaign', () => {
  it('is refused before anything is written', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const { token } = await table.invite(dm, SEREN);
    const before = await table.credentials.findInvitation(hashToken(token));
    const outcome = await redeemInvitation(table.engine, { ...table.signIn, moves: AWAY }, token);
    expect(outcome).toEqual({ kind: 'refused', reason: 'moved' });
    expect(await table.credentials.findInvitation(hashToken(token))).toEqual(before);
    expect((await table.engine.load('ravenford'))?.state.roster.get(SEREN)).toBeUndefined();
    // At home, the same invitation seats Seren.
    const home = await redeemInvitation(table.engine, table.signIn, token);
    expect(home.kind).toBe('redeemed');
  });
});
