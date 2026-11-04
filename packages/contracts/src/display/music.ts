import { z } from 'zod';

/**
 * The DM's music (docs/adr/0059-atmosphere.md §3): tracks the DM uploads — MP3, OGG, M4A or WAV,
 * up to 15 MB each, at most 30 a campaign — kept beside the world and private to the campaign. One
 * plays at a time, once or on repeat, on every screen that plays the table's sound, from the same
 * moment: the table's state keeps when it started (or where it paused), never the sound itself.
 */
export const MUSIC_MEDIA_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/wav'] as const;
export type MusicMediaType = (typeof MUSIC_MEDIA_TYPES)[number];

export const MAX_TRACK_BYTES = 15 * 1024 * 1024;
export const MAX_TRACKS = 30;

export const trackTitleSchema = z.string().trim().min(1).max(80);

/**
 * `POST …/music?title=…&requestId=…` with the file's bytes as the body (DM). A track's length is
 * what each screen reads from the sound itself, never what a browser said it was.
 */
export const trackUploadQuerySchema = z
  .object({
    title: trackTitleSchema,
    /** The upload's own ID: a retried upload adds the track once. */
    requestId: z.uuid(),
  })
  .strict();

export interface TrackView {
  readonly trackId: string;
  readonly title: string;
  readonly mediaType: MusicMediaType;
  readonly bytes: number;
  readonly addedAt: string;
}

/** `GET …/music`: the campaign's tracks, oldest first. */
export interface TrackListResponse {
  readonly tracks: readonly TrackView[];
  readonly limit: number;
}

/**
 * `GET …/clock`: the server's time as it answers, by which every screen plays the DM's music from
 * the same moment. A view of its own, never watched by the live stream: it changes every moment.
 */
export interface ClockResponse {
  readonly now: string;
}

/** The track playing, as the table's state keeps it. */
export interface MusicPlaying {
  readonly trackId: string;
  readonly repeat: boolean;
  /** When the track's start falls (moved on by a pause); null while paused. */
  readonly startedAt: string | null;
  /** Seconds into the track where it paused; null while it plays. */
  readonly pausedAt: number | null;
}

export const musicPlayingSchema = z
  .object({
    trackId: z.uuid(),
    repeat: z.boolean(),
    startedAt: z.iso.datetime().nullable(),
    pausedAt: z.number().min(0).nullable(),
  })
  .strict();

/** What the DM does with the music (`POST …/lobby` `music`). */
export const musicChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('play'), trackId: z.uuid(), repeat: z.boolean() }).strict(),
  z.object({ action: z.literal('pause') }).strict(),
  z.object({ action: z.literal('resume') }).strict(),
  z.object({ action: z.literal('stop') }).strict(),
]);
export type MusicChange = z.infer<typeof musicChangeSchema>;

/**
 * The music after a change at `now` (ms): played from its start, paused where it is, resumed from
 * there, or stopped. A pause of nothing playing, or a resume of nothing paused, changes nothing.
 */
export function musicAfter(
  music: MusicPlaying | null,
  change: MusicChange,
  now: number,
): MusicPlaying | null {
  switch (change.action) {
    case 'play':
      return {
        trackId: change.trackId,
        repeat: change.repeat,
        startedAt: new Date(now).toISOString(),
        pausedAt: null,
      };
    case 'pause':
      return music && music.pausedAt === null
        ? { ...music, startedAt: null, pausedAt: musicPosition(music, now) }
        : music;
    case 'resume':
      return music && music.pausedAt !== null
        ? {
            ...music,
            startedAt: new Date(now - music.pausedAt * 1000).toISOString(),
            pausedAt: null,
          }
        : music;
    case 'stop':
      return null;
  }
}

/**
 * Seconds from the track's start at `now` (ms), unwrapped: a screen wraps it by the length it
 * reads from the sound when the track repeats, and hears nothing past the end when it does not.
 */
export function musicPosition(music: MusicPlaying, now: number): number {
  if (music.pausedAt !== null) return music.pausedAt;
  const started = Date.parse(music.startedAt ?? '');
  return Number.isNaN(started) ? 0 : Math.max(0, (now - started) / 1000);
}
