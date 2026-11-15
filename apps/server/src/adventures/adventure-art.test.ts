import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { preparedEncounterBookSchema } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ADVENTURES,
  ADVENTURE_DIRECTORIES,
  loadAdventurePictures,
  loadAdventureSeed,
} from './adventures.ts';

/**
 * Every ready adventure ships the pictures its play needs (docs/design/ravenford-art-bible.md §8.4):
 * a figure for each foe of a prepared fight, a battle map for each place a prepared fight happens,
 * and a portrait and a figure for each ready-made character. A ready-made character the World
 * Engine names in every copy is listed by its seed command (`seed-<prefix>-<NNNN>`,
 * `../images/seed-entities.ts`).
 */
const SEED_COMMAND = /\.([a-z][a-z0-9-]*)\.(\d{4})$/;

describe.each(ADVENTURES)('the pictures of %s', (adventure) => {
  const covered = async () => {
    const sets = (await loadAdventurePictures())[adventure] ?? [];
    const has = new Set<string>();
    for (const set of sets)
      for (const entry of set.entries)
        for (const entityId of entry.entityIds)
          has.add(`${entityId}|${entry.variant}|${entry.purpose}`);
    return has;
  };

  it('give every prepared fight its foes’ figures and its place’s battle map', async () => {
    const has = await covered();
    const book = preparedEncounterBookSchema.parse(
      JSON.parse(
        await readFile(join(ADVENTURE_DIRECTORIES[adventure].en, 'encounters.json'), 'utf8'),
      ),
    );
    const missing: string[] = [];
    for (const encounter of book.encounters) {
      if (!has.has(`${encounter.locationId}|derived|battle-map`))
        missing.push(`${encounter.encounterId}: no battle map of ${encounter.locationId}`);
      for (const foe of encounter.foes) {
        if (!has.has(`${foe.entityId}|reference|image`))
          missing.push(`${encounter.encounterId}: no picture of ${foe.entityId}`);
        if (!has.has(`${foe.entityId}|derived|figure`))
          missing.push(`${encounter.encounterId}: no figure of ${foe.entityId}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('give every ready-made character a portrait and a figure', async () => {
    const has = await covered();
    const seed = await loadAdventureSeed(adventure, 'en');
    const characters: string[] = [];
    for (const submission of seed.submissions as { commandId: string; command: unknown }[]) {
      const command = submission.command as { type: string; kind?: string; entityId?: string };
      if (command.type === 'CreateEntity' && command.kind === 'character' && command.entityId)
        characters.push(command.entityId);
      const match = SEED_COMMAND.exec(submission.commandId);
      if (command.type === 'CreateCharacter' && match)
        characters.push(`seed-${match[1] ?? ''}-${match[2] ?? ''}`);
    }
    expect(characters.length).toBeGreaterThan(0);
    const missing = characters.flatMap((id) =>
      [`${id}|reference|image`, `${id}|derived|figure`].filter((key) => !has.has(key)),
    );
    expect(missing).toEqual([]);
  });

  it('give every place and every named person a picture', async () => {
    const has = await covered();
    const seed = await loadAdventureSeed(adventure, 'en');
    const missing: string[] = [];
    for (const submission of seed.submissions as { command: unknown }[]) {
      const command = submission.command as { type: string; kind?: string; entityId?: string };
      if (
        command.type === 'CreateEntity' &&
        (command.kind === 'location' || command.kind === 'npc') &&
        command.entityId &&
        !has.has(`${command.entityId}|reference|image`)
      )
        missing.push(command.entityId);
    }
    expect(missing).toEqual([]);
  });
});
