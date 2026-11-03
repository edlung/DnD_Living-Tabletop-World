import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { keptHandoutSchema, randomTableSchema, type Language } from '@ltw/contracts';
import { z } from 'zod';

import type { AuthClock } from '../auth/session-authenticator.ts';
import { iso } from '../auth/session-authenticator.ts';
import type { LibraryStore } from '../library/library-store.ts';
import { ADVENTURE_DIRECTORIES, type Adventure } from './adventures.ts';

/**
 * The DM's library an adventure was written with (`library.json`, docs/adr/0058-campaign-content.md
 * §5): its handouts kept for later and its random tables, copied into a new campaign's library
 * under fresh IDs. An adventure written without one copies nothing.
 */
export const adventureLibrarySchema = z
  .object({
    handouts: z.array(keptHandoutSchema).max(100),
    tables: z.array(randomTableSchema).max(50),
  })
  .strict();
export type AdventureLibrary = z.infer<typeof adventureLibrarySchema>;

export async function readAdventureLibrary(
  adventure: Adventure,
  language: Language,
): Promise<AdventureLibrary | null> {
  const file = join(ADVENTURE_DIRECTORIES[adventure][language], 'library.json');
  try {
    await access(file);
  } catch {
    return null;
  }
  return adventureLibrarySchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

export async function copyLibrary(
  store: LibraryStore,
  campaignId: string,
  adventure: Adventure,
  language: Language,
  clock: AuthClock,
): Promise<void> {
  const library = await readAdventureLibrary(adventure, language);
  if (!library) return;
  // The library lists the newest change first: each entry a millisecond older than the one before,
  // the file's order is the list's.
  const now = clock.now();
  let age = 0;
  const updatedAt = () => iso(now - (age += 1));
  const base = { campaignId, givenAt: null } as const;
  for (const body of library.handouts)
    await store.put({
      ...base,
      entryId: randomUUID(),
      kind: 'handout',
      body,
      updatedAt: updatedAt(),
    });
  for (const body of library.tables)
    await store.put({
      ...base,
      entryId: randomUUID(),
      kind: 'table',
      body,
      updatedAt: updatedAt(),
    });
}
