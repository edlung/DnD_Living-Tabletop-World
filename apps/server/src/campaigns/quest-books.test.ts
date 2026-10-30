import { describe, expect, it, vi } from 'vitest';

import { activationMemoryFixture, acceptedActivation } from '../testing/activation-fixture.ts';
import { initialQuestDigest } from '../workshop/activation/digests.ts';
import type { CampaignInitialContent } from './content.ts';
import { createCampaignQuestBooks } from './quest-books.ts';

async function initialContent() {
  const f = await activationMemoryFixture(),
    record = await acceptedActivation(f.repository, {
      ...f.scope,
      authSessionId: f.authSessionId,
      request: f.request,
      frozen: f.frozen,
    });
  await f.content.prepare(record);
  const content = await f.content.get(record.campaignId);
  if (!content) throw new Error('TEST_CONTENT');
  return content;
}

describe('immutable per-campaign quest books', () => {
  it('binds campaign and digest and clones only the quest definitions into a scoped cache', async () => {
    const content = await initialContent(),
      get = vi.fn(() => Promise.resolve(content)),
      books = createCampaignQuestBooks({ prepare: () => Promise.resolve(), get });
    const read = await books.get(content.campaignId, content.questDigest);
    expect(read).toEqual(content.quests);
    expect(read).not.toBe(content.quests);
    expect(read?.[0]).not.toBe(content.quests[0]);
    expect(read?.[0]?.activation.subject).not.toBe('sluice-journal');
    expect(await books.get('another-campaign', content.questDigest)).toBeNull();
    expect(await books.get(content.campaignId, `sha256:${'f'.repeat(64)}`)).toBeNull();
    expect(await books.get(content.campaignId, content.questDigest)).toBe(read);
    expect(get).toHaveBeenCalledTimes(3);
    expect(read).not.toHaveProperty('scenario');
    expect(read).not.toHaveProperty('assets');
  });

  it('fails closed for missing or corrupted books without caching their failure', async () => {
    const content = await initialContent(),
      altered = structuredClone(content.quests);
    const first = altered[0];
    if (!first) throw new Error('TEST_QUEST');
    first.title = 'Tampered title retaining an old digest';
    let stored: CampaignInitialContent | null = null;
    const get = vi.fn(() => Promise.resolve(stored)),
      books = createCampaignQuestBooks({ prepare: () => Promise.resolve(), get });
    expect(await books.get(content.campaignId, content.questDigest)).toBeNull();
    stored = { ...content, quests: altered };
    expect(initialQuestDigest(altered)).not.toBe(content.questDigest);
    expect(await books.get(content.campaignId, content.questDigest)).toBeNull();
    stored = content;
    expect(await books.get(content.campaignId, content.questDigest)).toEqual(content.quests);
    expect(get).toHaveBeenCalledTimes(3);
    first.title = 'A later external mutation';
    expect((await books.get(content.campaignId, content.questDigest))?.[0]?.title).toBe(
      content.quests[0]?.title,
    );
  });

  it('propagates storage failure instead of silently returning a global book', async () => {
    const books = createCampaignQuestBooks({
      prepare: () => Promise.resolve(),
      get: () => Promise.reject(new Error('TEST_STORAGE_UNAVAILABLE')),
    });
    await expect(books.get('missing', `sha256:${'0'.repeat(64)}`)).rejects.toThrow(
      'TEST_STORAGE_UNAVAILABLE',
    );
  });
});
