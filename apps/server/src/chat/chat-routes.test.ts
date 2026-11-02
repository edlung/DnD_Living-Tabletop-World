import type { ChatLogResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * Table talk (docs/adr/0044-online-play.md §1): everyone reads the table's chat; a whisper to the
 * DM is the whisperer's and the DM's; the DM's word to one player is that player's and the DM's.
 * A player speaks as their own character only.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

const say = (perspective: string, token: string, body: Record<string, unknown>) =>
  post(app, `${BASE}/chat?perspective=${perspective}`, body, token);
const log = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/chat?perspective=${perspective}`, token)).json<ChatLogResponse>();

describe('table talk', () => {
  it('keeps whispers between their two and the table’s talk for all', async () => {
    expect(
      (
        await say('PLAYER', TOKENS.player, {
          channel: 'table',
          voice: 'in-character',
          text: 'We should follow the ruts north.',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await say('PLAYER', TOKENS.player, {
          channel: 'dm',
          voice: 'out-of-character',
          text: 'Can I check the cart for poison?',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await say('DM', TOKENS.dm, {
          channel: 'player',
          voice: 'out-of-character',
          recipientId: ELOWEN,
          text: 'You notice a faint smell of bitter almonds.',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await say('DM', TOKENS.dm, {
          channel: 'player',
          voice: 'out-of-character',
          recipientId: 'brann-ironvale',
          text: 'Brann, your shield arm aches.',
        })
      ).statusCode,
    ).toBe(201);

    const dm = await log('DM', TOKENS.dm);
    expect(dm.messages).toHaveLength(4);
    const elowen = await log('PLAYER', TOKENS.player);
    expect(elowen.messages.map((message) => message.text)).toEqual([
      'We should follow the ruts north.',
      'Can I check the cart for poison?',
      'You notice a faint smell of bitter almonds.',
    ]);
    expect(elowen.messages[0]).toMatchObject({
      channel: 'table',
      voice: 'in-character',
      speaker: { entityId: ELOWEN, name: 'Elowen Starwhisper' },
    });
    expect(elowen.messages[2]?.speaker).toBeNull();
    // Someone outside reads nothing; the party's view reads the table's talk only.
    expect((await get(app, `${BASE}/chat?perspective=DM`, TOKENS.outsider)).statusCode).toBe(404);
    const party = await log('PARTY', TOKENS.player);
    expect(party.messages.map((message) => message.channel)).toEqual(['table']);
  });

  it('lets a player speak only as their character, and the DM to a player by name', async () => {
    expect(
      (await say('PARTY', TOKENS.player, { channel: 'table', voice: 'in-character', text: 'Hi' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await say('PLAYER', TOKENS.player, {
          channel: 'player',
          voice: 'in-character',
          recipientId: 'brann-ironvale',
          text: 'Psst',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await say('DM', TOKENS.dm, { channel: 'player', voice: 'in-character', text: 'Who?' }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await say('DM', TOKENS.dm, {
          channel: 'player',
          voice: 'in-character',
          recipientId: 'mira-vale',
          text: 'Not a seat',
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await say('PLAYER', TOKENS.player, { channel: 'table', voice: 'in-character', text: '' }))
        .statusCode,
    ).toBe(400);
  });

  it('rests a speaker after thirty messages a minute', async () => {
    for (let index = 0; index < 30; index += 1) {
      const sent = await say('PLAYER', TOKENS.player, {
        channel: 'table',
        voice: 'out-of-character',
        text: `Message ${String(index)}`,
      });
      expect(sent.statusCode).toBe(201);
    }
    expect(
      (
        await say('PLAYER', TOKENS.player, {
          channel: 'table',
          voice: 'out-of-character',
          text: 'One more',
        })
      ).statusCode,
    ).toBe(429);
  });
});
