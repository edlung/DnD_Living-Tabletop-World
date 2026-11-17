import {
  STORY_CAST_CHARS,
  castSchema,
  type CastResponse,
  type DisplayPairingResponse,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { seededEngine } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';
import { castForParty } from './display-routes.ts';

/**
 * The story cast (docs/adr/0073-table-ideas.md §8): one picture of something the party knows, or
 * none, and the DM's words. Below the DM a picture the party does not know is none — not even its
 * ID travels — and the words are shown as the DM wrote them.
 */
const BASE = '/campaigns/ravenford';
// The Abandoned Caravan Site: the DM's secret until the party finds it (knowledge-boundary.json).
const SECRET = 'location-f3b82c8b';
const WORDS = 'The road bends north, and the lanterns of Ravenford fall behind you.';

describe('the story cast’s shape', () => {
  it('is words, with or without a picture', () => {
    expect(castSchema.parse({ kind: 'story', text: `  ${WORDS}  ` })).toEqual({
      kind: 'story',
      entityId: null,
      text: WORDS,
    });
    expect(
      castSchema.safeParse({ kind: 'story', entityId: 'market-square', text: WORDS }).success,
    ).toBe(true);
    for (const cast of [
      { kind: 'story' },
      { kind: 'story', text: '   ' },
      { kind: 'story', text: 'x'.repeat(STORY_CAST_CHARS + 1) },
      { kind: 'story', text: WORDS, by: 'narrator' },
      { kind: 'story', text: WORDS, entityId: 'Not An Id' },
    ]) {
      expect(castSchema.safeParse(cast).success, JSON.stringify(cast).slice(0, 50)).toBe(false);
    }
  });
});

describe('the story cast below the DM', () => {
  it('keeps the words and a picture the party knows, and drops one it does not', async () => {
    const snapshot = await (await seededEngine()).load('ravenford');
    if (!snapshot) throw new Error('no Ravenford');
    const { state } = snapshot;
    const display = { actorId: 'display:living-room', kind: 'display' } as const;
    const player = { actorId: 'player-elowen', kind: 'user' } as const;
    const known = { kind: 'story', entityId: 'market-square', text: WORDS } as const;
    const secret = { kind: 'story', entityId: SECRET, text: WORDS } as const;
    for (const actor of [display, player]) {
      expect(castForParty(state, actor, known, null).cast).toEqual(known);
      const shown = castForParty(state, actor, secret, null).cast;
      expect(shown).toEqual({ kind: 'story', entityId: null, text: WORDS });
      expect(JSON.stringify(shown)).not.toContain(SECRET);
    }
    const bare = { kind: 'story', entityId: null, text: WORDS } as const;
    expect(castForParty(state, display, bare, null).cast).toEqual(bare);
  });
});

describe('the story cast over HTTP', () => {
  it('is the DM’s to cast; a display reads it without a picture the party does not know', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const asked = await table.send('POST', '/display/pair', {}, {});
    const header = asked.headers['set-cookie'];
    const display =
      (Array.isArray(header) ? header : [header ?? ''])
        .map((value) => value.split(';')[0] ?? '')
        .find((pair) => pair.startsWith('ltw_display=')) ?? '';
    const { code } = asked.json<DisplayPairingResponse>();
    await table.send('POST', `${BASE}/displays`, { cookie: dm }, { code });
    const put = (cast: unknown, cookie = dm) =>
      table.send('POST', `${BASE}/display/cast`, { cookie }, { cast });
    const read = (cookie: string) => table.send('GET', `${BASE}/display/cast`, { cookie });

    expect((await put({ kind: 'story', entityId: SECRET, text: WORDS })).statusCode).toBe(200);
    // The DM reads the cast as cast; the display the words alone, and nothing of the picture.
    expect((await read(dm)).json<CastResponse>().cast).toEqual({
      kind: 'story',
      entityId: SECRET,
      text: WORDS,
    });
    const shown = await read(display);
    expect(shown.json<CastResponse>().cast).toEqual({ kind: 'story', entityId: null, text: WORDS });
    expect(shown.body).not.toContain(SECRET);

    expect((await put({ kind: 'story', entityId: 'market-square', text: WORDS })).statusCode).toBe(
      200,
    );
    expect((await read(display)).json<CastResponse>().cast).toMatchObject({
      entityId: 'market-square',
    });
    // A picture of nothing in the world, words too long, and a display's own try are refused.
    expect((await put({ kind: 'story', entityId: 'no-such-thing', text: WORDS })).statusCode).toBe(
      404,
    );
    expect((await put({ kind: 'story', text: 'x'.repeat(STORY_CAST_CHARS + 1) })).statusCode).toBe(
      400,
    );
    expect((await put({ kind: 'story', text: WORDS }, display)).statusCode).toBe(403);
    await table.app.close();
  });
});
