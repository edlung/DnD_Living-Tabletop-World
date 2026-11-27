// Rebuild the small offline reading edition from the authored Lighthouse campaign.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { modifierOf, skillModifier } from '../../../packages/rules/src/character-math.ts';

const base = new URL('./', import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, base), 'utf8'));
const campaign = '../../../campaigns/lighthouse/';
const [book, pack, cast, reserve, cards, atlas] = await Promise.all([
  read('../../../fixtures/campaign-library/lighthouse/book.json'),
  read(campaign + 'package.json'),
  read(campaign + 'source/cast.json'),
  read(campaign + 'variants/without-asya.json'),
  read(campaign + 'source/handouts.json'),
  read(campaign + 'source/world-map.json'),
]);
const entities = Object.fromEntries(pack.entities.map((entity) => [entity.key, entity]));
const chapters = book.chapters.map((chapter) => ({
  title: chapter.title,
  place: chapter.place,
  location: entities[chapter.place].name,
  opening: chapter.readAloud,
  people: chapter.people,
  encounter: chapter.encounters[0] ?? null,
  scenes: chapter.pages.map((page) => ({
    title: page.title,
    text: page.text,
    choices: page.choices,
    check: page.check.line,
    rolls: page.check.options.map(({ check, dc }) => ({ key: check.ability ?? check.skill, dc })),
    consequence: page.failForward,
    minutes: page.minutes,
  })),
}));

function hero(entry) {
  const sheet = (entities[entry.key] ?? reserve.entities.find((e) => e.key === entry.key)).sheet;
  const roles = { fighter: 'Воин', rogue: 'Плут', cleric: 'Жрец', wizard: 'Волшебник' };
  return {
    id: entry.key,
    name: entry.name,
    role: roles[entry.classId],
    kind: 'hero',
    description: entry.role,
    subtitle: entry.species + ' · Уровень ' + sheet.classes[0].level,
    portrait: entry.art,
    figure: 'heroes-' + entry.key,
    hp: sheet.hitPoints.max,
    ac: sheet.armorClass,
    speed: sheet.speedFt,
    motive: entry.want,
    cues: entry.simple,
    keepsake: entry.keepsake,
    modifiers: Object.fromEntries(
      book.chapters.flatMap((c) =>
        c.pages.flatMap((p) =>
          p.check.options.map(({ check }) => [
            check.ability ?? check.skill,
            check.ability ? modifierOf(sheet, check.ability) : skillModifier(sheet, check.skill),
          ]),
        ),
      ),
    ),
  };
}

function person(entry) {
  return {
    id: entry.key,
    name: entry.name,
    role: 'Персонаж мастера',
    kind: 'npc',
    description: entry.public,
    subtitle: entities[entry.location]?.name ?? '',
    portrait: entry.key,
    figure: 'npcs-' + entry.key,
    motive: entry.want,
    voice: entry.voice,
    secret: entry.secret,
    reveal: entry.reveal,
  };
}

const people = Object.fromEntries(
  [...cast.heroes.map(hero), ...cast.npcs.map(person)].map((entry) => [entry.id, entry]),
);
const fights = Object.fromEntries(
  pack.encounters.map((encounter) => [
    encounter.key,
    {
      title: encounter.title,
      map: encounter.location,
      trigger: encounter.trigger,
      actors: encounter.combatants.map(({ entity: id, position }) => {
        const sheet = entities[id].sheet ?? entities[id].statBlock;
        const attack = sheet.attacks?.[0];
        return {
          id,
          x: position.x,
          y: position.y,
          hp: sheet.hitPoints.max,
          ac: sheet.armorClass,
          ...(attack && {
            action:
              attack.name +
              ' · +' +
              attack.bonus +
              ' к попаданию · ' +
              attack.damage.count +
              'd' +
              attack.damage.sides +
              ' + ' +
              attack.damage.bonus +
              ' дробящего урона',
          }),
        };
      }),
    },
  ]),
);

const out = new URL('data/', base);
await mkdir(out, { recursive: true });
const formatOptions = await resolveConfig(new URL('prepare-sample.mjs', base));
async function save(name, statement) {
  const content =
    '// Срез авторских материалов. Источник и сборка — prepare-sample.mjs.\n' + statement + '\n';
  return writeFile(
    new URL(name + '.generated.js', out),
    await format(content, { ...formatOptions, parser: 'babel' }),
  );
}
for (let i = 0; i < chapters.length; i += 3) {
  await save(
    'act-' + (i / 3 + 1),
    'window.Lighthouse.chapters.push(...' +
      JSON.stringify(chapters.slice(i, i + 3), null, 2) +
      ');',
  );
}
await save(
  'cast',
  'Object.assign(window.Lighthouse, ' + JSON.stringify({ people, fights }, null, 2) + ');',
);
const playerSheets = Object.fromEntries(
  ['finn', 'tess', 'asya'].map((id) => {
    const { name, role, subtitle, description, portrait, hp, ac, speed, cues, keepsake, motive } =
      people[id];
    const sheet = entities[id].sheet;
    const abilities = Object.entries(sheet.abilities).map(([key, score]) => ({
      key,
      score,
      modifier: modifierOf(sheet, key),
    }));
    const playerRole = id === 'asya' ? 'Жрица' : role;
    const playerSubtitle = id === 'asya' ? subtitle.replace('Полуэльф', 'Полуэльфийка') : subtitle;
    return [
      id,
      {
        name,
        role: playerRole,
        subtitle: playerSubtitle,
        description,
        portrait,
        hp,
        ac,
        speed,
        cues,
        keepsake,
        motive,
        abilities,
      },
    ];
  }),
);
await save('player-heroes', 'window.LighthouseHeroes = ' + JSON.stringify(playerSheets) + ';');
const handouts = Object.fromEntries(
  cards.map(({ key, title, text, task }) => [key.slice(8), { title, text, task }]),
);
const places = Object.fromEntries(
  atlas.pins.map(({ place, x, y }) => [place, { name: entities[place].name, x, y }]),
);
await save(
  'materials',
  'Object.assign(window.Lighthouse, ' + JSON.stringify({ handouts, places }) + ');',
);
await copyFile(
  new URL(campaign + 'assets/world-map/world-map.webp', base),
  new URL('art/archipelago.webp', base),
);
