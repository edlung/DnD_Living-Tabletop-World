import {
  campaignPackageSchema,
  type CampaignEntity,
  type CampaignKnowledge,
  type CampaignPackage,
} from '../../packages/contracts/src/index.ts';

import {
  cast,
  chapters,
  clues,
  DEFAULT_PARTY,
  HERO_KEYS,
  items,
  world,
  type HeroKey,
} from './data.ts';
import { encounters, foeEntities } from './encounters.ts';
import { heroSheet } from './sheets.ts';

const placed = (
  key: string,
  name: string,
  kind: CampaignEntity['kind'],
  location: string,
  description: string,
): CampaignEntity => ({
  key,
  name,
  kind,
  description,
  status: 'active',
  existsSince: null,
  placement: { location, since: null },
});
const record = (
  key: string,
  scope: CampaignKnowledge['scope'],
  statement: string,
  subjects: string[],
): CampaignKnowledge => ({
  key,
  scope,
  knowledgeType: scope.kind === 'WORLD_TRUTH' ? 'SECRET' : 'FACT',
  statement,
  subjects,
  knownSince: null,
  relations: [],
});

function knowledge(party: readonly HeroKey[]): CampaignKnowledge[] {
  return [
    record(
      'public-harbor',
      { kind: 'PUBLIC' },
      'Фонарная Гавань — город над облаками. Капитан Руна пригласила друзей на праздник у пристани.',
      ['winds', 'harbor', 'runa'],
    ),
    record(
      'party-opening',
      { kind: 'PARTY' },
      'Вы давно знакомы и пришли на праздник вместе. Руна пригласила вас к общему столу; рядом пришвартован дом-корабль «Чайник».',
      [...party, 'runa', 'harbor', 'ship'],
    ),
    ...world.truth.map((statement, index) =>
      record(`truth-${index + 1}`, { kind: 'WORLD_TRUTH' }, statement, ['severin', 'lighthouse']),
    ),
    ...cast.npcs.flatMap((npc): CampaignKnowledge[] => [
      ...npc.knows.map((statement, index): CampaignKnowledge => ({
        ...record(`${npc.key}-knows-${index + 1}`, { kind: 'NPC', holder: npc.key }, statement, [
          npc.key,
        ]),
        knowledgeType: 'TESTIMONY',
        attributedTo: npc.key,
        disclosure:
          npc.key === 'severin' || (npc.key === 'runa' && index === 1) ? 'GUARDED' : 'WILLING',
      })),
      {
        ...record(`${npc.key}-private`, { kind: 'NPC', holder: npc.key }, npc.secret, [npc.key]),
        knowledgeType: 'SECRET',
        disclosure: 'GUARDED',
      },
      record(`${npc.key}-direction`, { kind: 'DM' }, `${npc.want} ${npc.boundary} ${npc.reveal}`, [
        npc.key,
      ]),
    ]),
  ];
}

const equipment: Record<HeroKey, readonly [string, string][]> = {
  finn: [
    ['traveller-jerkin', 'Дорожная куртка Финна'],
    ['oak-buckler', 'Щит с медным листом'],
    ['hemp-rope', 'Страховочная верёвка'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  tess: [
    ['traveller-jerkin', 'Дорожная куртка Тэс'],
    ['thieves-picks', 'Набор тонких инструментов'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  asya: [
    ['traveller-jerkin', 'Дорожная куртка Аси'],
    ['herbalist-pouch', 'Сумка травницы'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  mika: [
    ['cartographer-tools', 'Картографические инструменты'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
};

/** Original authored content; not a substitute for runtime GENERATE or an executed campaign. */
export function buildLighthousePackage(party: readonly HeroKey[] = DEFAULT_PARTY): CampaignPackage {
  if (
    party.length < 3 ||
    party.length > 4 ||
    new Set(party).size !== party.length ||
    party.some((key) => !HERO_KEYS.includes(key))
  )
    throw new Error('Choose three or four different prepared heroes');
  const heroes = party.map((key) => {
    const hero = cast.heroes.find((entry) => entry.key === key);
    if (!hero) throw new Error(`Missing hero ${key}`);
    return {
      ...placed(key, hero.name, 'character', 'harbor', `${hero.look} ${hero.role}.`),
      sheet: heroSheet(key),
    };
  });
  const gear = party.flatMap((holder) =>
    equipment[holder].map(([catalog, name], index) => ({
      key: `${holder}-gear-${index + 1}`,
      name,
      holder,
      catalog,
    })),
  );
  const entities: CampaignEntity[] = [
    ...world.locations.map((location): CampaignEntity => ({
      key: location.key,
      name: location.name,
      kind: 'location',
      description: location.description,
      status: 'active',
      existsSince: null,
      location: {
        type: location.type as 'region' | 'settlement' | 'site' | 'building',
        parent: location.parent,
      },
    })),
    ...heroes,
    ...cast.npcs.map((npc) =>
      placed(
        npc.key,
        npc.name,
        'npc',
        npc.key === 'spool' ? 'harbor' : npc.location,
        `${npc.look} ${npc.public}`,
      ),
    ),
    ...clues.map((clue) =>
      placed(`e-${clue.key}`, clue.name, 'feature', clue.location, clue.appearance),
    ),
    ...items.map((item) => placed(item.key, item.name, 'item', item.location, item.description)),
    ...gear.map((item): CampaignEntity => ({
      key: item.key,
      name: item.name,
      kind: 'item',
      description: item.name,
      status: 'active',
      existsSince: null,
    })),
    ...foeEntities(),
  ];
  return campaignPackageSchema.parse({
    schemaVersion: 1,
    brief: {
      intent: world.pitch,
      setting: 'Оригинальный архипелаг над облачным морем.',
      tone: world.tone,
      duration: world.duration,
      partySize: party.length,
      partyLevel: 3,
      include: [
        `${party.length} игрока и взрослый ведущий`,
        'Свободный порядок островов',
        'Мирные решения',
        'Личный эпилог каждому',
        'Точки отдыха внутри вечера',
      ],
      exclude: [
        'Обязательная жертва спутника',
        'Насилие над детьми',
        'Единственная улика за броском',
        'Скрытые домашние правила',
      ],
    },
    world: {
      name: world.title,
      worldName: 'Острова Между Ветрами',
      language: 'ru',
      startsAt: 64800,
      startLocation: 'harbor',
      weather: 'clear',
      opening: world.opening,
    },
    entities,
    party: [...party],
    knowledge: knowledge(party),
    relationships: cast.npcs.map((npc) => ({
      npc: npc.key,
      attitude: npc.key === 'severin' ? 'WARY' : 'FRIENDLY',
    })),
    possessions: gear.map((item) => ({
      item: item.key,
      holder: item.holder,
      catalog: item.catalog,
      quantity: 1,
    })),
    clues: clues.map((clue) => ({
      key: clue.key,
      entity: `e-${clue.key}`,
      method: 'inspect',
      statement: clue.statement,
      subjects: clue.subjects,
    })),
    conflicts: [
      {
        key: 'living-map',
        title: 'Карта и живой мир',
        description: 'Острова меняются, но общий механизм удерживает старую схему.',
        actors: ['severin', 'runa', 'ilyr'],
        stakes: 'Свободные пути, понятная ответственность и возможность исправлять ошибки.',
      },
      {
        key: 'whose-voice',
        title: 'Чьё завтра',
        description: 'Жители хотят разного ритма и ищут способ слышать друг друга.',
        actors: ['kanto', 'pom', 'omb', 'vey'],
        stakes: 'Общее решение без исчезновения отдельных голосов.',
      },
    ],
    situations: chapters.map((chapter) => ({
      key: chapter.key,
      title: chapter.title,
      location: chapter.location,
      description: `${chapter.goal} ${chapter.readAloud}`,
      hooks: [chapter.goal],
      participants: chapter.participants,
      clueKeys:
        chapter.number === 9
          ? []
          : chapter.number === 10
            ? [...chapter.clues, 'captain-addendum']
            : chapter.clues,
      approaches: chapter.scenes.flatMap((scene) => scene.choices),
      developments: chapter.consequences,
    })),
    encounters: encounters(party),
    quests: [
      {
        questId: 'opening-inquiry',
        title: 'Что случилось с вечером?',
        activation: {
          subject: 'ship',
          summary: 'Исследовать странности праздника и познакомиться с кораблём.',
        },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'looked',
            locationId: 'harbor',
            summary: 'Осмотрены детали праздника.',
          },
          {
            kind: 'reached',
            stage: 'aboard',
            locationId: 'ship',
            summary: 'Герои поднялись на «Чайник».',
          },
        ],
        completion: 'aboard',
      },
      {
        questId: 'compare-records',
        title: 'Сравнить свидетельства',
        activation: { subject: 'library', summary: 'Найти старые документы и сравнить версии.' },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'read',
            locationId: 'library',
            summary: 'Осмотрены библиотечные документы.',
          },
          {
            kind: 'shown-to',
            stage: 'asked',
            npcId: 'runa',
            subject: 'runa',
            after: 'read',
            summary: 'Сведения показаны Руне; её ответ ещё нужно оценить.',
          },
        ],
        completion: 'asked',
      },
      {
        questId: 'understand-rings',
        title: 'Как устроен Маяк',
        activation: { subject: 'forge', summary: 'Выяснить способы безопасного ремонта.' },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'studied',
            locationId: 'forge',
            summary: 'Осмотрены схемы Кузницы.',
          },
          {
            kind: 'returned-to',
            stage: 'shared',
            locationId: 'harbor',
            after: 'studied',
            summary: 'Герои вернулись в гавань со сведениями о ремонте.',
          },
        ],
        completion: 'shared',
      },
      {
        questId: 'lighthouse-fieldwork',
        title: 'У Маяка',
        activation: {
          subject: 'lighthouse',
          summary: 'Проверить механизм и сообщить о наблюдениях.',
        },
        milestones: [
          {
            kind: 'reached',
            stage: 'arrived',
            locationId: 'lighthouse',
            summary: 'Достигнут Маяк.',
          },
          {
            kind: 'examined-at',
            stage: 'observed',
            locationId: 'lighthouse',
            summary: 'Осмотрен пульт Маяка; результат запуска определяется действиями.',
          },
          {
            kind: 'shown-to',
            stage: 'reported',
            npcId: 'runa',
            subject: 'lighthouse',
            after: 'observed',
            summary:
              'Сведения о Маяке показаны Руне. Итог мира записывает ведущий по реальным событиям.',
          },
        ],
        completion: 'reported',
      },
    ],
    visuals: entities
      .filter(
        (entity) => entity.kind !== 'feature' && !gear.some((item) => item.key === entity.key),
      )
      .map((entity) => ({
        entity: entity.key,
        purpose: 'image',
        description: entity.description,
        style:
          'Живописная гуашь, индиго, бирюза, медь и янтарный свет. Без надписей, тайных мотивов и подсказок к загадкам.',
      })),
    firstSession:
      chapters[0]?.scenes.map(
        (scene) => `${scene.title}. ${scene.play} Неудача: ${scene.failForward}`,
      ) ?? [],
    laterOutline: chapters
      .slice(1)
      .map(
        (chapter) => `Вечер ${chapter.number}. ${chapter.title}. ${chapter.goal} ${chapter.dmNote}`,
      ),
  });
}
