import type { ChatChannel, ChatVoice } from '@ltw/contracts';
import type pg from 'pg';

import type { ChatRecord, ChatStore } from './chat-store.ts';

/** Table talk on PostgreSQL (migration 0030_chat.sql): append-only, newest by position. */
interface ChatRow {
  readonly campaign_id: string;
  readonly message_id: string;
  readonly channel: ChatChannel;
  readonly voice: ChatVoice;
  readonly speaker_id: string | null;
  readonly recipient_id: string | null;
  readonly body: string;
  readonly created_at: Date;
}

const toRecord = (row: ChatRow): ChatRecord => ({
  campaignId: row.campaign_id,
  messageId: row.message_id,
  channel: row.channel,
  voice: row.voice,
  speakerId: row.speaker_id,
  recipientId: row.recipient_id,
  text: row.body,
  at: row.created_at.toISOString(),
});

export class PostgresChatStore implements ChatStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async add(record: ChatRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_chat_messages
         (campaign_id, message_id, channel, voice, speaker_id, recipient_id, body, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.campaignId,
        record.messageId,
        record.channel,
        record.voice,
        record.speakerId,
        record.recipientId,
        record.text,
        record.at,
      ],
    );
  }

  async recent(campaignId: string, limit: number): Promise<readonly ChatRecord[]> {
    const { rows } = await this.#pool.query<ChatRow>(
      `SELECT campaign_id, message_id, channel, voice, speaker_id, recipient_id, body, created_at
         FROM ltw_chat_messages WHERE campaign_id = $1 ORDER BY position DESC LIMIT $2`,
      [campaignId, limit],
    );
    return rows.map(toRecord).reverse();
  }
}
