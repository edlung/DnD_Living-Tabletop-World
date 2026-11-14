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
      'public-station',
      { kind: 'PUBLIC' },
      'Вересковый Вокзал соединяет станции Янтарного леса. Проводница Марфа пригласила друзей в первый вагон Экспресса.',
      ['forest', 'station', 'marfa'],
    ),
    record(
      'party-opening',
      { kind: 'PARTY' },
      'Вы давно знакомы и отправляетесь в путешествие вместе. Марфа обещала общий стол у окна в Экспрессе «Тысяча Желудей».',
      [...party, 'marfa', 'station', 'train'],
    ),
    ...world.truth.map((statement, index) =>
      record(`truth-${index + 1}`, { kind: 'WORLD_TRUTH' }, statement, ['velt', 'tosh', 'glass']),
    ),
    ...cast.npcs.flatMap((npc): CampaignKnowledge[] => [
      ...npc.knows.map((statement, index): CampaignKnowledge => ({
        ...record(`${npc.key}-knows-${index + 1}`, { kind: 'NPC', holder: npc.key }, statement, [
          npc.key,
        ]),
        knowledgeType: 'TESTIMONY',
        attributedTo: npc.key,
        disclosure: npc.key === 'velt' || npc.key === 'iva' ? 'GUARDED' : 'WILLING',
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
  boris: [
    ['traveller-jerkin', 'Дорожная куртка Бориса'],
    ['oak-buckler', 'Щит с медным листом'],
    ['hemp-rope', 'Страховочная верёвка'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  nika: [
    ['traveller-jerkin', 'Дорожная куртка Ники'],
    ['thieves-picks', 'Набор тонких инструментов'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  yara: [
    ['traveller-jerkin', 'Дорожная куртка Яры'],
    ['herbalist-pouch', 'Сумка травницы'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  oren: [
    ['cartographer-tools', 'Картографические инструменты'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
};

/** Original authored content; not a substitute for runtime GENERATE or an executed campaign. */
export function buildAcornPackage(party: readonly HeroKey[] = DEFAULT_PARTY): CampaignPackage {
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
      ...placed(key, hero.name, 'character', 'station', `${hero.look} ${hero.role}.`),
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
      placed(npc.key, npc.name, 'npc', npc.location, `${npc.look} ${npc.public}`),
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
      setting: world.setting,
      tone: world.tone,
      duration: world.duration,
      partySize: party.length,
      partyLevel: 3,
      include: [
        `${party.length} игрока и взрослый ведущий`,
        'Свободный порядок станций',
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
      worldName: world.worldName,
      language: 'ru',
      startsAt: world.startsAt,
      startLocation: world.startLocation,
      weather: 'clear',
      opening: world.opening,
    },
    entities,
    party: [...party],
    knowledge: knowledge(party),
    relationships: cast.npcs.map((npc) => ({
      npc: npc.key,
      attitude: npc.key === 'velt' ? 'WARY' : 'FRIENDLY',
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
        key: 'living-passenger',
        title: 'Пассажир или груз',
        description: 'Живое существо оказалось записано в накладной как источник энергии.',
        actors: ['tosh', 'iva', 'velt'],
        stakes: 'Право на безопасный дом и выбор; честное исправление ошибки.',
      },
      {
        key: 'shared-warmth',
        title: 'Тепло для всех станций',
        description:
          'Жителям нужно тепло, а привычная поставка смолы сократилась после изменения русла.',
        actors: ['velt', 'kapel', 'moroshka', 'berest', 'marfa'],
        stakes: 'Реальные совместные работы, уход за рекой и проверяемая ответственность.',
      },
    ],
    situations: chapters.map((chapter) => ({
      key: chapter.key,
      title: chapter.title,
      location: chapter.location,
      description: `${chapter.goal} ${chapter.readAloud}`,
      hooks: [chapter.goal],
      participants: chapter.participants,
      clueKeys: chapter.clues,
      approaches: chapter.scenes.flatMap((scene) => scene.choices),
      developments: chapter.consequences,
    })),
    encounters: encounters(party),
    quests: [
      {
        questId: 'empty-cradle',
        title: 'Пустая колыбель',
        activation: { subject: 'station', summary: 'Осмотреть груз и проверить путь к мосту.' },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'examined',
            locationId: 'station',
            summary: 'Осмотрены детали на вокзале.',
          },
          {
            kind: 'reached',
            stage: 'bridge',
            locationId: 'bridge',
            summary: 'Герои дошли до Моста Перелётных Гнёзд.',
          },
        ],
        completion: 'bridge',
      },
      {
        questId: 'compare-report',
        title: 'Пропущенные страницы',
        activation: { subject: 'glass', summary: 'Сравнить исследование с выводом заказчика.' },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'read',
            locationId: 'glass',
            summary: 'Осмотрены материалы оранжереи.',
          },
          {
            kind: 'shown-to',
            stage: 'asked',
            npcId: 'iva',
            subject: 'iva',
            after: 'read',
            summary: 'Сведения показаны Иве; её ответ требует оценки.',
          },
        ],
        completion: 'asked',
      },
      {
        questId: 'river-fieldwork',
        title: 'Куда ушла вода',
        activation: { subject: 'valley', summary: 'Проверить старое русло и привезти сведения.' },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'studied',
            locationId: 'valley',
            summary: 'Осмотрено русло; ремонт ещё не считается выполненным.',
          },
          {
            kind: 'returned-to',
            stage: 'shared',
            locationId: 'train',
            after: 'studied',
            summary: 'Герои вернулись к общему столу со сведениями.',
          },
        ],
        completion: 'shared',
      },
      {
        questId: 'garden-visit',
        title: 'У Первых Корней',
        activation: { subject: 'garden', summary: 'Проверить условия для будущего дома.' },
        milestones: [
          {
            kind: 'reached',
            stage: 'arrived',
            locationId: 'garden',
            summary: 'Достигнут Сад Первых Корней.',
          },
          {
            kind: 'examined-at',
            stage: 'observed',
            locationId: 'garden',
            summary: 'Осмотрены вода и земля; судьбу Тоша определяют решения.',
          },
          {
            kind: 'shown-to',
            stage: 'reported',
            npcId: 'marfa',
            subject: 'garden',
            after: 'observed',
            summary: 'Наблюдения показаны Марфе. Итог записывает ведущий по реальным событиям.',
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
          'Живописная гуашь и цветной карандаш, янтарный лес, каштановый красный, нефритовые крыши и лиловый туман. Без надписей, тайных мотивов и подсказок к загадкам.',
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
