import { MAX_TRACKS, type MusicMediaType, type TrackView } from '@ltw/contracts';

/**
 * The DM's music (docs/adr/0059-atmosphere.md §3; migration 0038): the tracks of a campaign, their
 * bytes kept beside the world, never canonical. The in-memory store is the reference semantics for
 * the PostgreSQL one: at most `MAX_TRACKS` a campaign, counted and added in one step; an upload
 * retried with its request ID gives back the track it added; a deleted track is gone.
 */
export interface TrackRecord extends TrackView {
  readonly campaignId: string;
  readonly requestId: string;
}

export type TrackAdd = Omit<TrackRecord, 'bytes'> & { readonly content: Uint8Array };

export interface TrackStore {
  /** The campaign's tracks, oldest first. */
  list(campaignId: string): Promise<readonly TrackRecord[]>;
  get(campaignId: string, trackId: string): Promise<TrackRecord | null>;
  /** `length` bytes of the track from `start` (to its end when longer); null when there is none. */
  read(
    campaignId: string,
    trackId: string,
    start: number,
    length: number,
  ): Promise<Uint8Array | null>;
  /** Adds it; the campaign's full; or the track a retried upload added before. */
  add(track: TrackAdd): Promise<TrackRecord | 'limit'>;
  /** False when there is no such track. */
  delete(campaignId: string, trackId: string): Promise<boolean>;
}

const key = (campaignId: string, trackId: string) => `${campaignId}\n${trackId}`;

export class InMemoryTrackStore implements TrackStore {
  readonly #tracks = new Map<string, { record: TrackRecord; content: Uint8Array }>();

  #of(campaignId: string) {
    return [...this.#tracks.values()]
      .filter((track) => track.record.campaignId === campaignId)
      .sort((a, b) => a.record.addedAt.localeCompare(b.record.addedAt));
  }

  list(campaignId: string): Promise<readonly TrackRecord[]> {
    return Promise.resolve(this.#of(campaignId).map((track) => ({ ...track.record })));
  }

  get(campaignId: string, trackId: string): Promise<TrackRecord | null> {
    const track = this.#tracks.get(key(campaignId, trackId));
    return Promise.resolve(track ? { ...track.record } : null);
  }

  read(
    campaignId: string,
    trackId: string,
    start: number,
    length: number,
  ): Promise<Uint8Array | null> {
    const track = this.#tracks.get(key(campaignId, trackId));
    return Promise.resolve(track ? track.content.slice(start, start + length) : null);
  }

  add(track: TrackAdd): Promise<TrackRecord | 'limit'> {
    const tracks = this.#of(track.campaignId);
    const again = tracks.find((one) => one.record.requestId === track.requestId);
    if (again) return Promise.resolve({ ...again.record });
    if (tracks.length >= MAX_TRACKS) return Promise.resolve('limit');
    const { content, ...rest } = track;
    const record: TrackRecord = { ...rest, bytes: content.byteLength };
    this.#tracks.set(key(track.campaignId, track.trackId), {
      record,
      content: content.slice(),
    });
    return Promise.resolve({ ...record });
  }

  delete(campaignId: string, trackId: string): Promise<boolean> {
    return Promise.resolve(this.#tracks.delete(key(campaignId, trackId)));
  }
}

/**
 * What a file's first bytes say it is — MP3 (an ID3 tag or a frame's sync), OGG, M4A (an MPEG-4
 * `ftyp` box) or WAV — whatever the browser called it; null for anything else.
 */
export function sniffAudio(bytes: Uint8Array): MusicMediaType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.byteLength < 12) return null;
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(4, 8) === 'ftyp') return 'audio/mp4';
  if (ascii(0, 3) === 'ID3') return 'audio/mpeg';
  // An MPEG audio frame: eleven set bits, then a layer that is not "reserved".
  const [first = 0, second = 0] = bytes;
  return first === 0xff && (second & 0xe0) === 0xe0 && (second & 0x06) !== 0 ? 'audio/mpeg' : null;
}

/** A track as the routes show it: without the campaign and the upload's request ID. */
export const trackView = (record: TrackRecord): TrackView => ({
  trackId: record.trackId,
  title: record.title,
  mediaType: record.mediaType,
  bytes: record.bytes,
  addedAt: record.addedAt,
});
