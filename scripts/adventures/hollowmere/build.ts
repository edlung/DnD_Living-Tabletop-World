import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

import {
  kernelCommandSchema,
  keptHandoutSchema,
  preparedEncounterBookSchema,
  questBookSchema,
  randomTableSchema,
} from '../../../packages/contracts/src/index.ts';
import { srdMonsterBlock } from '../../../packages/rules/src/index.ts';

import { ENCOUNTERS, QUESTS } from './books.ts';
import { ALL_FOES, FIGHTING_PEOPLE } from './foes.ts';
import { LOOT, STORY_OBJECTS } from './items.ts';
import { HANDOUTS, TABLES } from './library.ts';
import { CLUES, KNOWLEDGE } from './lore.ts';
import { OPTIONS, PREGENS } from './party.ts';
import { LANGUAGES, type Language } from './text.ts';
import { PINS, REGION, ROUTES } from './travel.ts';
import { CAMPAIGN, OPENING, PEOPLE, PLACES } from './world.ts';

/**
 * Writes The Bells of Hollowmere (docs/adr/0058-campaign-content.md §5) into its fixtures, English
 * in `fixtures/hollowmere/` and Russian in `fixtures/hollowmere-ru/`: six seed scripts the World
 * Engine runs for every new campaign, its quest book, its prepared encounters and its DM's library.
 * Every command and book is held to its contracts schema here; a test holds the fixtures to what
 * this writes. Run `pnpm adventures:build` after changing the adventure.
 */
export const CAMPAIGN_ID = 'hollowmere';
export const DM_ACTOR_ID = 'dm-hollowmere';

type Command = Record<string, unknown>;

const placed = (at: string | null) =>
  at === null ? {} : { placement: { locationId: at, since: null } };

function seeds(language: Language): Record<string, readonly Command[]> {
  const say = (text: { readonly en: string; readonly ru: string }) => text[language];
  const world: Command[] = [
    {
      type: 'CreateCampaign',
      name: say(CAMPAIGN.name),
      worldName: say(CAMPAIGN.worldName),
      startsAt: CAMPAIGN.startsAt,
      language,
      adventure: CAMPAIGN_ID,
    },
    { type: 'SetCampaignOptions', options: OPTIONS },
    ...PLACES.map((place) => ({
      type: 'CreateEntity',
      entityId: place.id,
      kind: 'location',
      name: say(place.name),
      description: say(place.description),
      existsSince: null,
      location: { type: place.type, parentId: place.parent },
    })),
    ...PEOPLE.map((one) => ({
      type: 'CreateEntity',
      entityId: one.id,
      kind: one.kind,
      name: say(one.name),
      description: say(one.description),
      existsSince: null,
      ...placed(one.at),
    })),
    ...STORY_OBJECTS.map((thing) => ({
      type: 'CreateEntity',
      entityId: thing.id,
      kind: 'item',
      name: say(thing.name),
      description: say(thing.description),
      existsSince: null,
      ...placed(thing.at),
    })),
    // The region's map: its pins and routes, for the DM's travel (ADR 0057 §7–8).
    { type: 'SetMapPins', regionId: REGION, pins: PINS },
    ...ROUTES.map(({ fromId, toId, miles, terrain, road }) => ({
      type: 'SetRoute',
      fromId,
      toId,
      route: { miles, terrain, road },
    })),
    {
      type: 'StartScene',
      sceneId: OPENING.sceneId,
      title: say(OPENING.title),
      locationId: OPENING.locationId,
    },
  ];
  const people: Command[] = [
    ...KNOWLEDGE.map((record) => ({
      type: 'AddKnowledge',
      knowledgeId: record.id,
      scope: record.scope,
      knowledgeType: record.type,
      statement: say(record.statement),
      subjects: record.subjects,
      ...(record.attributedTo ? { attributedTo: record.attributedTo } : {}),
      knownSince: record.knownSince,
    })),
    // A record an NPC holds is guarded until set otherwise: only the willing ones are written.
    ...KNOWLEDGE.flatMap((record) =>
      record.disclosure === 'WILLING'
        ? [{ type: 'SetDisclosure', knowledgeId: record.id, disclosure: record.disclosure }]
        : [],
    ),
  ];
  const block = (monster: string) => {
    const found = srdMonsterBlock(monster);
    if (!found) throw new Error(`no SRD monster ${monster}`);
    return found.statBlock;
  };
  const foes: Command[] = [
    ...ALL_FOES.flatMap((foe) => [
      {
        type: 'CreateEntity',
        entityId: foe.id,
        kind: 'creature',
        name: say(foe.name),
        description: say(foe.description),
        existsSince: null,
      },
      { type: 'SetStatBlock', entityId: foe.id, statBlock: block(foe.monster) },
    ]),
    ...FIGHTING_PEOPLE.map((one) => ({
      type: 'SetStatBlock',
      entityId: one.id,
      statBlock: block(one.monster),
    })),
  ];
  const items: Command[] = LOOT.flatMap((thing) => [
    {
      type: 'CreateEntity',
      entityId: thing.id,
      kind: 'item',
      name: say(thing.name),
      description: say(thing.description),
      existsSince: null,
    },
    {
      type: 'GrantItem',
      itemId: thing.id,
      holderId: thing.holder,
      catalogId: thing.catalog,
      ...(thing.base === undefined ? {} : { baseCatalogId: thing.base }),
      quantity: thing.quantity,
    },
  ]);
  const party: Command[] = PREGENS.map((pregen) => ({
    type: 'CreateCharacter',
    name: say(pregen.name),
    choices: pregen.choices,
    locationId: OPENING.locationId,
  }));
  const investigation: Command[] = CLUES.map((clue) => ({
    type: 'AddClue',
    clueId: clue.id,
    entityId: clue.on,
    method: clue.method,
    ...(clue.dc === undefined ? {} : { dc: clue.dc }),
    statement: say(clue.statement),
    subjects: clue.subjects,
  }));
  return {
    'world-seed.json': world,
    'people-seed.json': people,
    'foes-seed.json': foes,
    'items-seed.json': items,
    'party-seed.json': party,
    'investigation-seed.json': investigation,
  };
}

/** Every fixture file of one language, by name, as it is written. */
export function composeAdventure(language: Language): Record<string, unknown> {
  const say = (text: { readonly en: string; readonly ru: string }) => text[language];
  const files: Record<string, unknown> = {};
  for (const [file, commands] of Object.entries(seeds(language))) {
    for (const command of commands) kernelCommandSchema.parse(command);
    files[file] = { campaignId: CAMPAIGN_ID, dmActorId: DM_ACTOR_ID, commands };
  }
  files['quests.json'] = questBookSchema.parse({
    $comment:
      'The Bells of Hollowmere quest book (ADR 0058 §5): written by scripts/adventures/hollowmere/build.ts.',
    quests: QUESTS.map((quest) => ({
      questId: quest.questId,
      title: say(quest.title),
      activation: { subject: quest.activation.subject, summary: say(quest.activation.summary) },
      milestones: quest.milestones.map((one) => ({ ...one, summary: say(one.summary) })),
      completion: quest.completion,
    })),
  });
  files['encounters.json'] = preparedEncounterBookSchema.parse({
    $comment:
      'The Bells of Hollowmere prepared encounters (ADR 0058 §5): written by scripts/adventures/hollowmere/build.ts.',
    encounters: ENCOUNTERS.map((one) => ({
      encounterId: one.encounterId,
      title: say(one.title),
      summary: say(one.summary),
      locationId: one.locationId,
      battlefield: {
        width: one.width,
        height: one.height,
        difficult: one.difficult,
        cover: one.cover,
      },
      foes: one.foes,
      partyStart: one.partyStart,
    })),
  });
  files['library.json'] = {
    handouts: HANDOUTS.map((handout) =>
      keptHandoutSchema.parse({ title: say(handout.title), text: say(handout.text) }),
    ),
    tables: TABLES.map((table) =>
      randomTableSchema.parse({
        name: say(table.name),
        die: table.die,
        results: table.results.map((one) => ({ ...one, text: say(one.text) })),
      }),
    ),
  };
  return files;
}

export const directoryOf = (language: Language): string =>
  fileURLToPath(
    new URL(
      `../../../fixtures/${language === 'en' ? 'hollowmere' : 'hollowmere-ru'}/`,
      import.meta.url,
    ),
  );

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const language of LANGUAGES) {
    const directory = directoryOf(language);
    mkdirSync(directory, { recursive: true });
    for (const [file, content] of Object.entries(composeAdventure(language))) {
      const path = `${directory}${file}`;
      // As the repository's formatter writes JSON, so a build changes nothing it did not mean to.
      const options = (await prettier.resolveConfig(path)) ?? {};
      writeFileSync(
        path,
        await prettier.format(JSON.stringify(content), { ...options, filepath: path }),
      );
    }
  }
}
