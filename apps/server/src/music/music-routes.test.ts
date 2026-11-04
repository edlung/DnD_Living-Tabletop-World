import { MAX_TRACKS, type LobbyResponse, type TrackListResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { rangeOf } from './music-routes.ts';
import { sniffAudio } from './track-store.ts';

/**
 * The DM's music (docs/adr/0059-atmosphere.md §3): the DM uploads, lists and deletes tracks; the
 * campaign's members play them a range at a time; nobody else reads them; the table's state plays,
 * pauses, resumes and stops one, and loses it when its track is deleted.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

/** A short WAV: its header, then `length` bytes of silence. */
function wav(length = 64): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(8000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(length, 40);
  return Buffer.concat([header, Buffer.alloc(length, 128)]);
}

const upload = (
  bytes: Buffer,
  token: string = TOKENS.dm,
  title = 'Tavern song',
  requestId: string = randomUUID(),
) =>
  app.inject({
    method: 'POST',
    url: `${BASE}/music?${new URLSearchParams({ title, requestId }).toString()}`,
    payload: bytes,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
  });

const list = async (token: string = TOKENS.dm) =>
  (await get(app, `${BASE}/music`, token)).json<TrackListResponse>();

const lobby = async () =>
  (await get(app, `${BASE}/lobby?perspective=DM`, TOKENS.dm)).json<LobbyResponse>();

const music = (body: object) =>
  post(app, `${BASE}/lobby?perspective=DM`, { music: body }, TOKENS.dm);

describe('the DM’s tracks', () => {
  it('are added by the DM, listed and played by the table, a range at a time', async () => {
    const added = await upload(wav(100));
    expect(added.statusCode).toBe(201);
    const track = added.json<{ trackId: string }>();
    expect(track).toMatchObject({ title: 'Tavern song', mediaType: 'audio/wav', bytes: 144 });
    // The player lists and plays it.
    expect((await list(TOKENS.player)).tracks.map((one) => one.trackId)).toEqual([track.trackId]);
    expect((await list()).limit).toBe(MAX_TRACKS);
    const whole = await get(app, `${BASE}/music/${track.trackId}`, TOKENS.player);
    expect(whole.statusCode).toBe(200);
    expect(whole.headers['content-type']).toBe('audio/wav');
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(whole.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(whole.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(whole.rawPayload.byteLength).toBe(144);
    // A browser's audio asks for a part.
    const part = await app.inject({
      method: 'GET',
      url: `${BASE}/music/${track.trackId}`,
      headers: { authorization: `Bearer ${TOKENS.player}`, range: 'bytes=8-11' },
    });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 8-11/144');
    expect(part.rawPayload.toString('ascii')).toBe('WAVE');
    const past = await app.inject({
      method: 'GET',
      url: `${BASE}/music/${track.trackId}`,
      headers: { authorization: `Bearer ${TOKENS.dm}`, range: 'bytes=500-' },
    });
    expect(past.statusCode).toBe(416);
    expect(past.headers['content-range']).toBe('bytes */144');
  });

  it('are nobody else’s: not an outsider’s to read, not a player’s to add or delete', async () => {
    const track = (await upload(wav())).json<{ trackId: string }>();
    expect((await get(app, `${BASE}/music`, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, `${BASE}/music/${track.trackId}`, TOKENS.outsider)).statusCode).toBe(
      404,
    );
    expect((await upload(wav(), TOKENS.player)).statusCode).toBe(403);
    expect(
      (await post(app, `${BASE}/music/${track.trackId}/delete`, {}, TOKENS.player)).statusCode,
    ).toBe(403);
  });

  it('take only sound, once per upload, and thirty at most', async () => {
    const text = await upload(Buffer.from('<html>not a song at all</html>'));
    expect(text.statusCode).toBe(400);
    expect(text.json()).toMatchObject({ reason: 'audio' });
    // A retried upload adds the track once.
    const requestId = randomUUID();
    const first = (await upload(wav(), TOKENS.dm, 'Once', requestId)).json<{ trackId: string }>();
    const again = (await upload(wav(), TOKENS.dm, 'Once', requestId)).json<{ trackId: string }>();
    expect(again.trackId).toBe(first.trackId);
    for (let count = 1; count < MAX_TRACKS; count += 1) {
      expect((await upload(wav(), TOKENS.dm, `Song ${String(count)}`)).statusCode).toBe(201);
    }
    const full = await upload(wav());
    expect(full.statusCode).toBe(409);
    expect(full.json()).toMatchObject({ reason: 'limit' });
  });

  it('play, pause, resume and stop with the table, and stop when deleted', async () => {
    const track = (await upload(wav())).json<{ trackId: string }>();
    expect((await music({ action: 'play', trackId: randomUUID(), repeat: false })).statusCode).toBe(
      404,
    );
    expect((await music({ action: 'play', trackId: track.trackId, repeat: true })).statusCode).toBe(
      204,
    );
    const playing = await lobby();
    expect(playing.sound.music).toMatchObject({
      trackId: track.trackId,
      repeat: true,
      pausedAt: null,
    });
    // Every screen plays it by the server's clock, a view of its own.
    const clock = (await get(app, `${BASE}/clock`, TOKENS.player)).json<{ now: string }>();
    expect(Date.parse(playing.sound.music?.startedAt ?? '')).toBeLessThanOrEqual(
      Date.parse(clock.now),
    );
    expect((await get(app, `${BASE}/clock`, TOKENS.outsider)).statusCode).toBe(404);
    expect((await music({ action: 'pause' })).statusCode).toBe(204);
    const paused = (await lobby()).sound.music;
    expect(paused?.startedAt).toBeNull();
    expect(paused?.pausedAt).toBeGreaterThanOrEqual(0);
    expect((await music({ action: 'resume' })).statusCode).toBe(204);
    expect((await lobby()).sound.music).toMatchObject({ pausedAt: null, repeat: true });
    // Another change of the table keeps it.
    await post(app, `${BASE}/lobby?perspective=DM`, { ambience: 'rain' }, TOKENS.dm);
    expect((await lobby()).sound).toMatchObject({ ambience: 'rain', music: { repeat: true } });
    expect(
      (await post(app, `${BASE}/music/${track.trackId}/delete`, {}, TOKENS.dm)).statusCode,
    ).toBe(204);
    expect((await lobby()).sound.music).toBeNull();
    expect((await get(app, `${BASE}/music/${track.trackId}`, TOKENS.dm)).statusCode).toBe(404);
    expect(
      (await post(app, `${BASE}/music/${track.trackId}/delete`, {}, TOKENS.dm)).statusCode,
    ).toBe(404);
    expect((await music({ action: 'stop' })).statusCode).toBe(204);
  });
});

describe('a range and a file’s kind', () => {
  it('reads one range of a track’s bytes, a part at a time when open', () => {
    expect(rangeOf(undefined, 100)).toBeNull();
    expect(rangeOf('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(rangeOf('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(rangeOf('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(rangeOf('bytes=95-200', 100)).toEqual({ start: 95, end: 99 });
    expect(rangeOf('bytes=100-', 100)).toBe('unsatisfiable');
    expect(rangeOf('bytes=-0', 100)).toBe('unsatisfiable');
    expect(rangeOf('bytes=0-1,5-9', 100)).toBeNull();
    // A part, not the whole of a long track.
    expect(rangeOf('bytes=0-', 15_000_000)).toEqual({ start: 0, end: 4 * 1024 * 1024 - 1 });
  });

  it('says MP3, OGG, M4A or WAV from the first bytes, else nothing', () => {
    const bytes = (head: number[] | string) =>
      new Uint8Array(
        Buffer.concat([
          typeof head === 'string' ? Buffer.from(head, 'latin1') : Buffer.from(head),
          Buffer.alloc(16),
        ]),
      );
    expect(sniffAudio(bytes('ID3\u0004'))).toBe('audio/mpeg');
    expect(sniffAudio(bytes([0xff, 0xfb, 0x90, 0x44]))).toBe('audio/mpeg');
    expect(sniffAudio(bytes('OggS'))).toBe('audio/ogg');
    expect(sniffAudio(bytes('\u0000\u0000\u0000 ftypM4A '))).toBe('audio/mp4');
    expect(sniffAudio(new Uint8Array(wav()))).toBe('audio/wav');
    expect(sniffAudio(bytes('%PDF-1.7'))).toBeNull();
    expect(sniffAudio(bytes([0xff, 0xe0, 0, 0]))).toBeNull();
    expect(sniffAudio(new Uint8Array([0x49, 0x44]))).toBeNull();
  });
});
