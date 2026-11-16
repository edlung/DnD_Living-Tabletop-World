import {
  MAX_PLACE_SOUNDS,
  type CastResponse,
  type LobbyResponse,
  type PlaceSoundsResponse,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { signInTable, type SignInTable } from '../testing/sign-in.ts';
import { InMemoryPlaceSoundStore } from './place-sound-store.ts';

/**
 * A place's own sound (docs/adr/0073-table-ideas.md §6): the DM keeps an ambience and a track for
 * a place; showing that place on the table's screens writes them into the table's sound, and
 * nothing else does. The DM's alone to set and to read.
 */
const BASE = '/campaigns/ravenford';
const SQUARE = 'market-square';
const GATE = 'north-gate';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function table() {
  const t = await signInTable();
  const dm = await t.signInWith(await t.dmInvitation());
  const send = (method: 'GET' | 'POST', path: string, body?: unknown, cookie: string = dm) =>
    t.send(method, `${BASE}/${path}`, { cookie }, body);
  const sound = async () =>
    (await send('GET', 'lobby?perspective=DM')).json<LobbyResponse>().sound;
  const keep = (place: string, body: unknown, cookie?: string) =>
    send('POST', `dm/place-sounds/${place}`, body, cookie);
  const show = async (locationId: string | null) =>
    (await send('POST', 'display/cast', { cast: { kind: 'scene', locationId } })).json<CastResponse>();
  return { t, dm, send, sound, keep, show };
}

/** A track of the campaign's, uploaded as the DM does: a few bytes that say they are a WAV. */
async function upload(t: SignInTable, cookie: string, title: string, id: number): Promise<string> {
  const wav = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([36, 0, 0, 0]),
    Buffer.from('WAVEfmt '),
    Buffer.alloc(24),
  ]);
  const response = await t.app.inject({
    method: 'POST',
    url: `${BASE}/music?title=${encodeURIComponent(title)}&requestId=${ID(id)}`,
    headers: { cookie, origin: 'https://table.example', 'content-type': 'audio/wav' },
    payload: wav,
  });
  if (response.statusCode >= 300) throw new Error(`upload refused: ${String(response.statusCode)}`);
  return response.json<{ trackId: string }>().trackId;
}

describe('a place’s own sound', () => {
  it('is kept by the DM, and showing the place switches it on', async () => {
    const { t, send, sound, keep, show } = await table();
    expect((await sound()).ambience).toBe('scene');
    expect((await keep(SQUARE, { ambience: 'crowd', trackId: null })).statusCode).toBe(204);
    expect((await send('GET', 'dm/place-sounds')).json<PlaceSoundsResponse>().sounds).toEqual([
      { locationId: SQUARE, ambience: 'crowd', trackId: null },
    ]);
    // Keeping it changes nothing the table hears.
    expect((await sound()).ambience).toBe('scene');
    // Showing the place does.
    const shown = await show(SQUARE);
    expect(shown.sound).toEqual({ ambience: true, music: false });
    expect((await sound()).ambience).toBe('crowd');
    // A place that brings nothing leaves the sound as it is.
    const other = await show(GATE);
    expect(other.sound).toBeUndefined();
    expect((await sound()).ambience).toBe('crowd');
    await t.app.close();
  });

  it('brings its track, from the start and on repeat, and does not restart it when shown again', async () => {
    const { t, dm, sound, keep, show } = await table();
    const trackId = await upload(t, dm, 'Tavern', 1);
    expect((await keep(SQUARE, { ambience: null, trackId })).statusCode).toBe(204);
    const first = await show(SQUARE);
    expect(first.sound).toEqual({ ambience: false, music: true });
    const playing = (await sound()).music;
    expect(playing).toMatchObject({ trackId, repeat: true, pausedAt: null });
    // The ambience was left as it was.
    expect((await sound()).ambience).toBe('scene');
    t.clock.advance(60_000);
    const again = await show(SQUARE);
    expect(again.sound).toEqual({ ambience: false, music: false });
    expect((await sound()).music).toEqual(playing);
    await t.app.close();
  });

  it('follows the party when the scene is shown “where the party is”', async () => {
    const { t, send, sound, keep, show } = await table();
    const cast = (await send('GET', 'display/cast')).json<CastResponse>();
    const here = cast.place;
    if (typeof here !== 'string') throw new Error('the party is somewhere');
    await keep(here, { ambience: 'night', trackId: null });
    expect((await show(null)).sound).toEqual({ ambience: true, music: false });
    expect((await sound()).ambience).toBe('night');
    await t.app.close();
  });

  it('is changed by nothing but the DM’s showing: the DM’s own choice stands afterwards', async () => {
    const { t, send, sound, keep, show } = await table();
    await keep(SQUARE, { ambience: 'crowd', trackId: null });
    await show(SQUARE);
    expect((await send('POST', 'lobby?perspective=DM', { ambience: 'none' })).statusCode).toBe(204);
    expect((await sound()).ambience).toBe('none');
    // Another cast that is no scene brings no sound.
    await send('POST', 'display/cast', { cast: { kind: 'dice' } });
    expect((await sound()).ambience).toBe('none');
    await t.app.close();
  });

  it('plays its ambience alone once its track is deleted', async () => {
    const { t, dm, send, sound, keep, show } = await table();
    const trackId = await upload(t, dm, 'Tavern', 1);
    await keep(SQUARE, { ambience: 'fire', trackId });
    expect((await send('POST', `music/${trackId}/delete`, {})).statusCode).toBeLessThan(300);
    expect((await show(SQUARE)).sound).toEqual({ ambience: true, music: false });
    expect(await sound()).toEqual({ ambience: 'fire', music: null });
    await t.app.close();
  });

  it('is taken away when it brings nothing', async () => {
    const { t, send, keep } = await table();
    await keep(SQUARE, { ambience: 'rain', trackId: null });
    expect((await keep(SQUARE, { ambience: null, trackId: null })).statusCode).toBe(204);
    expect((await send('GET', 'dm/place-sounds')).json<PlaceSoundsResponse>().sounds).toEqual([]);
    await t.app.close();
  });

  it('is a place’s only, of a track the campaign has, in the fixed words', async () => {
    const { t, keep } = await table();
    expect((await keep('mira-vale', { ambience: 'rain', trackId: null })).statusCode).toBe(422);
    expect((await keep('no-such-place', { ambience: 'rain', trackId: null })).statusCode).toBe(422);
    expect((await keep(SQUARE, { ambience: null, trackId: ID(9) })).statusCode).toBe(422);
    for (const body of [
      { ambience: 'thunder', trackId: null },
      { ambience: 'rain' },
      { ambience: 'rain', trackId: 'not-an-id' },
      { ambience: 'rain', trackId: null, volume: 11 },
      {},
    ]) {
      expect((await keep(SQUARE, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    await t.app.close();
  });

  it('is the DM’s alone to set and to read', async () => {
    const { t, dm, send, keep } = await table();
    await keep(SQUARE, { ambience: 'rain', trackId: null });
    const { token } = await t.invite(dm, 'elowen-starwhisper');
    const player = await t.signInWith(token);
    expect((await send('GET', 'dm/place-sounds', undefined, player)).statusCode).toBe(404);
    expect((await keep(SQUARE, { ambience: 'none', trackId: null }, player)).statusCode).toBe(404);
    expect((await t.send('GET', `${BASE}/dm/place-sounds`)).statusCode).toBe(401);
    expect((await send('GET', 'dm/place-sounds')).json<PlaceSoundsResponse>().sounds).toEqual([
      { locationId: SQUARE, ambience: 'rain', trackId: null },
    ]);
    await t.app.close();
  });
});

describe('the store of places’ sounds', () => {
  it('holds a campaign to its number of places', async () => {
    const store = new InMemoryPlaceSoundStore();
    for (let index = 0; index < MAX_PLACE_SOUNDS; index += 1) {
      expect(
        await store.put('ravenford', {
          locationId: `place-${String(index)}`,
          ambience: 'rain',
          trackId: null,
        }),
      ).toBe(true);
    }
    const one = { locationId: 'one-more', ambience: 'rain' as const, trackId: null };
    expect(await store.put('ravenford', one)).toBe(false);
    // One that has a sound is changed; another campaign has its own room.
    expect(await store.put('ravenford', { ...one, locationId: 'place-3', ambience: 'wind' })).toBe(
      true,
    );
    expect(await store.put('other-table', one)).toBe(true);
    expect((await store.get('ravenford', 'place-3'))?.ambience).toBe('wind');
  });
});
