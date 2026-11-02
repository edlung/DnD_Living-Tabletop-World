import type { ChatChannel, ChatVoice } from '@ltw/contracts';

/**
 * Table talk (docs/adr/0044-online-play.md §1; migration 0030): append-only messages beside the
 * world. The in-memory store is the reference semantics for the PostgreSQL one.
 */
export interface ChatRecord {
  readonly campaignId: string;
  readonly messageId: string;
  readonly channel: ChatChannel;
  readonly voice: ChatVoice;
  /** The speaking character; null for the DM. */
  readonly speakerId: string | null;
  /** The character a DM's message goes to (`player` only). */
  readonly recipientId: string | null;
  readonly text: string;
  readonly at: string;
}

export interface ChatStore {
  add(record: ChatRecord): Promise<void>;
  /** The latest messages of a campaign, oldest first. */
  recent(campaignId: string, limit: number): Promise<readonly ChatRecord[]>;
}

export class InMemoryChatStore implements ChatStore {
  readonly #messages: ChatRecord[] = [];

  add(record: ChatRecord): Promise<void> {
    this.#messages.push(record);
    return Promise.resolve();
  }

  recent(campaignId: string, limit: number): Promise<readonly ChatRecord[]> {
    return Promise.resolve(
      this.#messages.filter((message) => message.campaignId === campaignId).slice(-limit),
    );
  }
}
