import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCombatEngine } from '@ltw/combat';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  commandSubmissionSchema,
} from '@ltw/domain';
import { scriptedDice, skillCheckPort } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import { composeAdventure, directoryOf } from '../../../../scripts/adventures/hollowmere/build.ts';
import { characterBuilder } from '../characters/builder-port.ts';
import { InMemoryLibraryStore } from '../library/library-store.ts';
import { MIDDLE_ENTROPY } from '../testing/ravenford-app.ts';
import {
  ADVENTURE_DIRECTORIES,
  ADVENTURE_SEED_FILES,
  loadAdventureBooks,
  loadAdventureSeed,
} from './adventures.ts';
import { copyLibrary } from './library-copy.ts';

/**
 * The Bells of Hollowmere (docs/adr/0058-campaign-content.md §5): its fixtures are what its build
 * writes; every seed command of both languages is the World Engine's to accept; a copy is a level-1
 * world that levels by milestones, its ready-made characters free for invitations, its foes
 * waiting with the SRD's stat blocks; its books and library load.
 */
async function copyOf(language: 'en' | 'ru') {
  const engine = new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
    checks: skillCheckPort(scriptedDice([])),
    combat: createCombatEngine(),
    characters: characterBuilder,
    entropy: MIDDLE_ENTROPY,
  });
  const campaignId = `c-hollow-${language}`;
  const seed = await loadAdventureSeed('hollowmere', language);
  for (const input of seed.submissions) {
    const submission = commandSubmissionSchema.parse(input);
    const result = await engine.execute({
      ...submission,
      campaignId,
      commandId: `${campaignId}.${submission.commandId}`,
    });
    expect(result.status, `${submission.commandId}: ${JSON.stringify(result)}`).toBe('accepted');
  }
  const snapshot = await engine.load(campaignId);
  if (!snapshot) throw new Error('no campaign');
  return snapshot.state;
}

describe('The Bells of Hollowmere', () => {
  it('is in its fixtures as its build writes it, in both languages', () => {
    for (const language of ['en', 'ru'] as const) {
      expect(directoryOf(language)).toBe(ADVENTURE_DIRECTORIES.hollowmere[language]);
      for (const [file, content] of Object.entries(composeAdventure(language))) {
        const written: unknown = JSON.parse(
          readFileSync(join(directoryOf(language), file), 'utf8'),
        );
        expect(written, `${language}/${file}`).toEqual(content);
      }
      const seeded = ADVENTURE_SEED_FILES.hollowmere.map((one) => one.file);
      expect(Object.keys(composeAdventure(language))).toEqual(
        expect.arrayContaining([...seeded, 'quests.json', 'encounters.json', 'library.json']),
      );
    }
  });

  it.each(['en', 'ru'] as const)(
    'seeds a level-1 world through the World Engine (%s)',
    async (language) => {
      const state = await copyOf(language);
      expect(state.campaign).toMatchObject({ language, adventure: 'hollowmere' });
      expect(state.campaign?.options.levelsBy).toBe('milestone');
      const characters = [...state.entities.values()].filter((one) => one.kind === 'character');
      expect(characters).toHaveLength(4);
      // Free for the DM's invitations: nobody plays them yet.
      expect(state.roster.size).toBe(0);
      for (const character of characters) {
        const sheet = state.characterSheets.get(character.entityId);
        expect(sheet?.classes.map((one) => one.level)).toEqual([1]);
        expect(character.placement?.locationId).toBe('north-gate');
      }
      const foes = [...state.entities.values()].filter((one) => one.kind === 'creature');
      expect(foes.length).toBeGreaterThan(20);
      for (const foe of foes) expect(state.statBlocks.has(foe.entityId)).toBe(true);
      expect(state.statBlocks.has('kerra-reed')).toBe(true);
      expect(state.activeSceneId).toBe('hollowmere-departure');
      // The Northern Fens map: its places pinned, the routes between them set for the DM's travel.
      expect(state.mapPins.get('fenlands')?.map((pin) => pin.placeId)).toEqual([
        'ravenford',
        'willow-ford',
        'hollowmere',
        'drowned-chapel',
        'sunken-mill',
      ]);
      expect(state.routes.size).toBe(5);
    },
  );

  it('loads its quest book and prepared encounters, and copies its library', async () => {
    const books = await loadAdventureBooks();
    const hollowmere = books['hollowmere'];
    expect(hollowmere?.quests.en?.map((quest) => quest.questId)).toEqual([
      'widows-wagon',
      'bells-of-hollowmere',
      'old-matthis',
    ]);
    expect(hollowmere?.quests.ru?.[0]?.title).toBe('Повозка вдовы');
    expect(hollowmere?.encounters.en).toHaveLength(7);
    // Ravenford's books are the app's own, as before.
    expect(books['ravenford']).toBeUndefined();
    const library = new InMemoryLibraryStore();
    await copyLibrary(library, 'c-hollow-ru', 'hollowmere', 'ru', {
      now: () => Date.UTC(2030, 0, 1),
    });
    const kept = await library.list('c-hollow-ru');
    expect(kept.flatMap((one) => (one.kind === 'handout' ? [one.body.title] : []))).toEqual([
      'Письмо о найме',
      'Предание: святой Одран',
      'Страница из просмолённой книги',
      'Предупреждение сестры Ильзе',
    ]);
    expect(kept.filter((one) => one.kind === 'table')).toHaveLength(3);
  });
});
