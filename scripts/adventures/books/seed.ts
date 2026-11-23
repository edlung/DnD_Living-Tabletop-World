import { readdirSync, readFileSync } from 'node:fs';

import type { CampaignBook } from '../../../packages/contracts/src/index.ts';

/**
 * What a built-in adventure's seed gives its book (docs/adr/0074-dm-book.md §2.8): the people and
 * clues as the seed states them, under the seed's own IDs, which are the book's keys.
 */
interface SeedCommand {
  type: string;
  entityId?: string;
  kind?: string;
  name?: string;
  description?: string;
  clueId?: string;
  method?: string;
  dc?: number;
  statement?: string;
  subjects?: string[];
  knowledgeId?: string;
  scope?: { kind: string; npcId?: string };
}
export interface AdventureSeed {
  readonly places: ReadonlySet<string>;
  readonly entities: ReadonlySet<string>;
  readonly clues: ReadonlySet<string>;
  readonly encounters: ReadonlySet<string>;
  readonly people: CampaignBook['people'];
  readonly clueCards: CampaignBook['clues'];
}

const METHOD: Readonly<Record<string, string>> = {
  inspect: 'Осмотр, без броска.',
  magic: 'Обнаружение магии, без броска.',
  perception: 'Внимательность',
  investigation: 'Анализ',
};

export function readSeed(directory: URL): AdventureSeed {
  const commands = readdirSync(directory)
    .filter((file) => file.endsWith('-seed.json'))
    .sort()
    .flatMap(
      (file) =>
        (JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as { commands: SeedCommand[] })
          .commands,
    );
  const created = commands.filter((c) => c.type === 'CreateEntity' && c.entityId !== undefined);
  const knows = (npc: string) =>
    commands
      .filter((c) => c.type === 'AddKnowledge' && c.scope?.kind === 'NPC' && c.scope.npcId === npc)
      .flatMap((c) => (c.statement === undefined ? [] : [c.statement]));
  const sentence = (text: string) => (/^[^.!?…]{1,110}/u.exec(text)?.[0] ?? text).trim();
  const encounters = JSON.parse(readFileSync(new URL('encounters.json', directory), 'utf8')) as {
    encounters: { encounterId: string }[];
  };
  return {
    places: new Set(created.filter((c) => c.kind === 'location').map((c) => c.entityId ?? '')),
    entities: new Set(created.map((c) => c.entityId ?? '')),
    clues: new Set(commands.flatMap((c) => (c.type === 'AddClue' && c.clueId ? [c.clueId] : []))),
    encounters: new Set(encounters.encounters.map((e) => e.encounterId)),
    people: created
      .filter((c) => c.kind === 'npc')
      .map((c) => ({
        key: c.entityId ?? '',
        name: c.name ?? '',
        look: c.description ?? '',
        public: '',
        want: '',
        knows: knows(c.entityId ?? ''),
      })),
    clueCards: commands
      .filter((c) => c.type === 'AddClue')
      .map((c) => ({
        key: c.clueId ?? '',
        name: sentence(c.statement ?? ''),
        appearance: '',
        statement: c.statement ?? '',
        subjects: (c.subjects ?? []).filter((key) => created.some((e) => e.entityId === key)),
        discovery:
          c.dc === undefined
            ? (METHOD[c.method ?? ''] ?? '')
            : `${METHOD[c.method ?? ''] ?? c.method ?? ''}, Сл ${String(c.dc)}.`,
      })),
  };
}
