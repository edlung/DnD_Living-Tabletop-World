import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import type { ChatRecord } from './chat-store.ts';
import { PostgresChatStore } from './postgres-chat-store.ts';

/** Table talk on PostgreSQL (migration 0030, Stage 630): append-only, the latest oldest first. */
let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

const message = (text: string, changes: Partial<ChatRecord> = {}): ChatRecord => ({
  campaignId: 'ravenford',
  messageId: randomUUID(),
  channel: 'table',
  voice: 'in-character',
  speakerId: 'elowen-starwhisper',
  recipientId: null,
  text,
  at: '2026-11-02T10:00:00.000Z',
  ...changes,
});

describe('PostgresChatStore', () => {
  it('keeps the latest messages oldest first, append-only, and its channels whole', async () => {
    const store = new PostgresChatStore(pool);
    await store.add(message('First'));
    await store.add(message('Second'));
    await store.add(
      message('To Elowen', {
        channel: 'player',
        speakerId: null,
        recipientId: 'elowen-starwhisper',
      }),
    );
    expect((await store.recent('ravenford', 2)).map((entry) => entry.text)).toEqual([
      'Second',
      'To Elowen',
    ]);
    await expect(pool.query('DELETE FROM ltw_chat_messages')).rejects.toThrow(/append-only/);
    // A DM's word to a player names its recipient; a whisper to the DM names its speaker.
    await expect(
      store.add(message('Nobody', { channel: 'player', speakerId: null })),
    ).rejects.toThrow();
    await expect(store.add(message('Who?', { channel: 'dm', speakerId: null }))).rejects.toThrow();
  });
});
