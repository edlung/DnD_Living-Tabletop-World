import { readFile } from 'node:fs/promises';

import { questBookSchema, type QuestDefinition } from '@ltw/contracts';

/**
 * Quest definitions (docs/adr/0025-ravenford-integration.md §2), read and
 * validated once at startup. Content, not state: the quest log is computed
 * from the campaign's history on every request.
 */
export async function loadQuestBook(path: string): Promise<readonly QuestDefinition[]> {
  return questBookSchema.parse(JSON.parse(await readFile(path, 'utf8'))).quests;
}
