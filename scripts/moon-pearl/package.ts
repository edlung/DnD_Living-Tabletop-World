import {
  campaignPackageSchema,
  type CampaignEntity,
  type CampaignKnowledge,
  type CampaignPackage,
  toNpcManner,
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
/** An NPC's authored voice as its public manner of speech, when it has one (ADR 0020 amendment 2026-11-14). */
const mannerOf = (voice: string | undefined): Pick<CampaignEntity, 'manner'> => {
  const manner = toNpcManner(voice);
  return manner === undefined ? {} : { manner };
};
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
      'public-city',
      { kind: 'PUBLIC' },
      'Перламутр стоит под прозрачными морскими сводами. В сухих галереях обычный воздух. Капитан Нора пригласила друзей в Музей Первого Голоса.',
      ['sea', 'museum', 'nora'],
    ),
    record(
      'party-opening',
      { kind: 'PARTY' },
      'Вы давно знакомы и пришли вместе по приглашению Норы на подготовку Праздника Первого Голоса. Общая лодочная каюта ждёт вас у причала.',
      [...party, 'nora', 'museum', 'boat'],
    ),
    ...world.truth.map((statement, index) =>
      record(`truth-${index + 1}`, { kind: 'WORLD_TRUTH' }, statement, [
        'lucien',
        'pearl',
        'museum',
      ]),
    ),
    ...cast.npcs.flatMap((npc): CampaignKnowledge[] => [
      ...npc.knows.map((statement, index): CampaignKnowledge => ({
        ...record(`${npc.key}-knows-${index + 1}`, { kind: 'NPC', holder: npc.key }, statement, [
          npc.key,
        ]),
        knowledgeType: 'TESTIMONY',
        attributedTo: npc.key,
        disclosure: npc.key === 'lucien' || npc.key === 'elma' ? 'GUARDED' : 'WILLING',
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
  toren: [
    ['traveller-jerkin', 'Дорожная куртка Торена'],
    ['oak-buckler', 'Щит с волной'],
    ['hemp-rope', 'Страховочная верёвка'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  leya: [
    ['traveller-jerkin', 'Дорожная куртка Леи'],
    ['thieves-picks', 'Набор тонких инструментов'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  amalia: [
    ['traveller-jerkin', 'Дорожная куртка Амалии'],
    ['herbalist-pouch', 'Сумка травницы'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
  emil: [
    ['cartographer-tools', 'Картографические инструменты'],
    ['woodland-balm', 'Лесной бальзам'],
  ],
};

/** Original authored content; not a substitute for runtime GENERATE or an executed campaign. */
export function buildPearlPackage(party: readonly HeroKey[] = DEFAULT_PARTY): CampaignPackage {
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
      ...placed(key, hero.name, 'character', 'museum', `${hero.look} ${hero.role}.`),
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
    ...cast.npcs.map((npc) => ({
      ...placed(npc.key, npc.name, 'npc', npc.location, `${npc.look} ${npc.public}`),
      ...mannerOf(npc.voice),
    })),
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
    ...foeEntities(party),
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
        'Свободный порядок расследования',
        'Мирные решения',
        'Финал, который решают действия на торгах',
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
      attitude: npc.key === 'lucien' ? 'WARY' : 'FRIENDLY',
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
        key: 'swapped-archive',
        title: 'Подмена в музее',
        description:
          'Люсьен заменил общий музыкальный архив стеклянной копией и выставил оригинал как личный лот.',
        actors: ['lucien', 'elma', 'dora'],
        stakes: 'Возврат, проверяемая ответственность и возможность исправления.',
      },
      {
        key: 'many-makers',
        title: 'Чьи имена останутся',
        description: 'Короткая музейная подпись скрывает совместный труд создателей архива.',
        actors: ['nora', 'ur', 'iris', 'elma'],
        stakes: 'Доступная общая история и согласованное будущее выставки.',
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
        questId: 'museum-comparison',
        title: 'Два основания',
        activation: {
          subject: 'museum',
          summary: 'Сравнить экспонат с описанием и найти сведения о перевозке.',
        },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'examined',
            locationId: 'museum',
            summary: 'Осмотрены музейные детали.',
          },
          {
            kind: 'reached',
            stage: 'quay',
            locationId: 'quay',
            summary: 'Герои пришли к причалу; выводы делают сами.',
          },
        ],
        completion: 'quay',
      },
      {
        questId: 'sound-comparison',
        title: 'Повторённый голос',
        activation: { subject: 'reef', summary: 'Сопоставить наблюдения и старую запись.' },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'read',
            locationId: 'reef',
            summary: 'Осмотрены схема и журнал сада.',
          },
          {
            kind: 'shown-to',
            stage: 'asked',
            npcId: 'ostin',
            subject: 'reef',
            after: 'read',
            summary: 'Сведения показаны Остину; сравнение не объявляет виновного автоматически.',
          },
        ],
        completion: 'asked',
      },
      {
        questId: 'first-makers',
        title: 'Полная история',
        activation: {
          subject: 'wreck',
          summary: 'Осмотреть старую мастерскую и принести наблюдения.',
        },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'studied',
            locationId: 'wreck',
            summary: 'Осмотрены материалы мастерской.',
          },
          {
            kind: 'returned-to',
            stage: 'shared',
            locationId: 'boat',
            after: 'studied',
            summary: 'Герои вернулись к общему столу с тем, что узнали в Первой Мастерской.',
          },
        ],
        completion: 'shared',
      },
      {
        questId: 'courier-trail',
        title: 'Чужая бирка',
        activation: {
          subject: 'courier-tag',
          summary: 'Понять, что везла почтовая артель, прежде чем кого-то подозревать.',
        },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'read',
            locationId: 'wreck',
            summary: 'Осмотрена бирка артели в Первой Мастерской; что она значит, решают герои.',
          },
          {
            kind: 'shown-to',
            stage: 'archive',
            npcId: 'ur',
            subject: 'courier-tag',
            after: 'read',
            summary: 'Бирка показана Уру в архиве.',
          },
          {
            kind: 'shown-to',
            stage: 'market',
            npcId: 'bubo',
            subject: 'courier-tag',
            after: 'read',
            summary: 'Бирка показана Бубо на рынке.',
          },
        ],
        completion: 'read',
      },
      {
        questId: 'glass-copy-chase',
        title: 'Копия наперегонки с водой',
        activation: {
          subject: 'glass-copy',
          summary:
            'Догнать ящик со стеклянной копией до того, как в полдень откроются ворота шлюза.',
        },
        milestones: [
          {
            kind: 'examined-at',
            stage: 'order',
            locationId: 'quay',
            summary: 'Найдено поручение курьеру; где копия сейчас, решает погоня.',
          },
          {
            kind: 'returned-to',
            stage: 'safe',
            locationId: 'boat',
            after: 'order',
            summary: 'Герои вернулись на лодку; цела ли копия, записывает ведущий.',
          },
        ],
        completion: 'safe',
      },
      {
        questId: 'lot-comparison',
        title: 'Осмотр лота',
        activation: { subject: 'nautilus', summary: 'Сверить предмет и представить наблюдения.' },
        milestones: [
          {
            kind: 'reached',
            stage: 'arrived',
            locationId: 'nautilus',
            summary: 'Достигнут Наутилус.',
          },
          {
            kind: 'examined-at',
            stage: 'observed',
            locationId: 'nautilus',
            summary: 'Осмотрены лот и приёмная книга; возврат ещё не считается выполненным.',
          },
          {
            kind: 'shown-to',
            stage: 'reported',
            npcId: 'iris',
            subject: 'nautilus',
            after: 'observed',
            summary:
              'Наблюдения показаны Ирис. Владение, ответственность и итог оформляются после реальных решений.',
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
          'Живописная гуашь и цветной карандаш, ультрамарин, бирюза, перламутр, коралловый и тёплое золото; сухие галереи под прозрачными морскими сводами. Без надписей, тайных мотивов и подсказок к загадкам.',
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
