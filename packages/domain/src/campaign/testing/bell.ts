import type { CampaignEntity, CampaignKnowledge, CampaignPackage } from '@ltw/contracts';

import { bellCrab, bellRanger, bellWizard } from './sheets.ts';

const location = (
  key: string,
  name: string,
  type: 'region' | 'settlement' | 'site' | 'building',
  parent: string | null,
): CampaignEntity => ({
  key,
  name,
  kind: 'location',
  description: name,
  status: 'active',
  existsSince: null,
  location: { type, parent },
});
const placed = (
  key: string,
  name: string,
  kind: 'npc' | 'character' | 'item' | 'feature' | 'creature',
  place: string,
  description: string,
): CampaignEntity => ({
  key,
  name,
  kind,
  description,
  status: 'active',
  existsSince: null,
  placement: { location: place, since: null },
});

/** Complete preparation specimen. Conditional developments are never played facts. */
export function bellCampaign(): CampaignPackage {
  return {
    schemaVersion: 1,
    brief: {
      intent: 'Расследование звона затонувшего колокола с мирным решением и необязательным боем.',
      setting: 'Северный речной посёлок Белая Пристань зимой.',
      tone: 'Тревожная сказка, доброжелательные люди и понятные мотивы.',
      duration: 'Первая сессия около двух часов.',
      partySize: 3,
      partyLevel: 3,
      include: ['Несколько путей к уликам', 'Возможность договориться'],
      exclude: ['Опасность для детей', 'Обязательный бой'],
    },
    world: {
      name: 'Колокол подо льдом',
      worldName: 'Белая Пристань',
      language: 'ru',
      startsAt: 32400,
      startLocation: 'dock',
      weather: 'snow',
      opening:
        'На причале слышен далёкий звон. Арден показывает объявление Ивы: нужен журнал старого шлюза.',
    },
    entities: bellEntities(),
    party: ['alena', 'borin', 'darya'],
    knowledge: bellKnowledge(),
    relationships: [
      { npc: 'iva', attitude: 'WARY' },
      { npc: 'arden', attitude: 'FRIENDLY' },
      { npc: 'nera', attitude: 'NEUTRAL' },
      { npc: 'sev', attitude: 'FRIENDLY' },
    ],
    clues: [
      {
        key: 'copper-trace',
        entity: 'copper-dust',
        method: 'inspect',
        statement: 'Медная пыль на причале совпадает с деталями старого шлюза.',
        subjects: ['copper-dust', 'sluice'],
      },
      {
        key: 'archive-plan',
        entity: 'plan-copy',
        method: 'inspect',
        statement: 'Копия плана показывает путь к старому шлюзу и место регулятора.',
        subjects: ['plan-copy', 'sluice', 'resonator'],
      },
      {
        key: 'safe-shutdown',
        entity: 'mentor-note',
        method: 'inspect',
        statement: 'Записка описывает ручную остановку резонатора до его настройки.',
        subjects: ['mentor-note', 'resonator'],
      },
      {
        key: 'missing-journal',
        entity: 'sluice-journal',
        method: 'inspect',
        statement:
          'Последняя запись связывает пробный запуск и изменение течения; журнал можно вернуть Иве.',
        subjects: ['sluice-journal', 'sluice', 'iva'],
      },
    ],
    conflicts: [
      {
        key: 'river-dispute',
        title: 'Кому доверить реку',
        description:
          'Перевозчики требуют безопасного прохода, а Ива пытается исправить свою ошибку.',
        actors: ['iva', 'arden', 'nera'],
        stakes: 'Судоходство, доверие и сохранность шлюза.',
      },
    ],
    situations: [
      {
        key: 'arrival',
        title: 'Звон на причале',
        location: 'dock',
        description: 'Арден готов поделиться слухом, а объявление Ивы предлагает понятную работу.',
        hooks: ['Вернуть журнал', 'Узнать источник звона'],
        participants: ['arden'],
        clueKeys: ['copper-trace'],
        approaches: ['Расспросить Ардена', 'Осмотреть причал', 'Пойти в архив'],
        developments: [
          {
            if: 'Партия публично обвинит Иву без доказательств',
            then: 'Перевозчики могут потребовать объяснений; ведущий решает их ответ.',
          },
        ],
      },
      {
        key: 'lighthouse-talk',
        title: 'Просьба смотрительницы',
        location: 'lighthouse',
        description: 'Ива показывает карту течений, но не желает сразу говорить о своём походе.',
        hooks: ['Сравнить карту с рассказом Ардена'],
        participants: ['iva'],
        clueKeys: [],
        approaches: ['Спокойно поговорить', 'Попросить показать путь к шлюзу'],
        developments: [
          {
            if: 'Ива решит довериться партии',
            then: 'Она может признаться в пробном запуске; это ещё не произошло.',
          },
        ],
      },
      {
        key: 'archive-route',
        title: 'Копия старого плана',
        location: 'archive',
        description: 'Сев разрешает изучить доступную копию плана.',
        hooks: ['Найти альтернативный путь к шлюзу'],
        participants: ['sev'],
        clueKeys: ['archive-plan'],
        approaches: ['Попросить копию', 'Осмотреть чертёж'],
        developments: [],
      },
      {
        key: 'workshop-route',
        title: 'Записка наставника',
        location: 'workshop',
        description:
          'Нера оставила на открытом верстаке копию записки для тех, кто помогает с рекой.',
        hooks: ['Понять механизм'],
        participants: ['nera'],
        clueKeys: ['safe-shutdown'],
        approaches: ['Показать медную деталь', 'Прочитать открытую записку'],
        developments: [],
      },
      {
        key: 'sluice-choice',
        title: 'У регулятора',
        location: 'sluice',
        description: 'Журнал лежит на служебной полке. Вибрация тревожит ледяного краба.',
        hooks: ['Остановить устройство', 'Вернуть журнал'],
        participants: ['ice-crab'],
        clueKeys: ['missing-journal'],
        approaches: ['Попросить Неру помочь', 'Ручная остановка', 'Отступить'],
        developments: [
          {
            if: 'Резонатор будет остановлен',
            then: 'Течение может успокоиться; последствие разыгрывается и записывается после решения игроков.',
          },
        ],
      },
    ],
    encounters: [
      {
        key: 'sluice-crab',
        title: 'Потревоженный краб',
        location: 'sluice',
        trigger: 'Ведущий может начать встречу, если партия приблизится к существу и выберет бой.',
        battlefield: {
          width: 8,
          height: 6,
          difficult: [{ x: 3, y: 2 }],
          cover: [{ x: 5, y: 3, level: 'half' }],
        },
        combatants: [
          { entity: 'alena', side: 'party', position: { x: 1, y: 1 } },
          { entity: 'borin', side: 'party', position: { x: 1, y: 2 } },
          { entity: 'darya', side: 'party', position: { x: 1, y: 3 } },
          { entity: 'ice-crab', side: 'hostile', position: { x: 6, y: 2 } },
        ],
      },
    ],
    quests: [
      {
        questId: 'river-bell',
        title: 'Вернуть реке спокойствие',
        activation: {
          subject: 'sluice-journal',
          summary: 'Помочь с поиском журнала старого шлюза.',
        },
        milestones: [
          {
            kind: 'reached',
            stage: 'find-sluice',
            locationId: 'sluice',
            summary: 'Найден старый шлюз.',
          },
          {
            kind: 'examined-at',
            stage: 'read-journal',
            locationId: 'sluice',
            summary: 'Осмотрены улики у шлюза.',
          },
          {
            kind: 'returned-to',
            stage: 'return-harbor',
            locationId: 'dock',
            after: 'read-journal',
            summary: 'Партия вернулась на причал после осмотра шлюза.',
          },
        ],
      },
    ],
    visuals: [
      ...['dock', 'lighthouse', 'workshop', 'archive', 'sluice'].map((entity) => ({
        entity,
        purpose: 'image' as const,
        description: 'Снежный речной посёлок, деревянные строения и мягкий зимний свет.',
        style: 'Единая северная фэнтези-палитра.',
      })),
      ...['iva', 'arden', 'nera', 'sev'].map((entity) => ({
        entity,
        purpose: 'image' as const,
        description: 'Тёплая дорожная одежда, естественный портрет в северном посёлке.',
        style: 'Единая живописная фэнтези-палитра.',
      })),
      {
        entity: 'sluice',
        purpose: 'battle-map',
        description: 'Настил, механизм, ледяной берег и свободные проходы.',
        style: 'Читаемый вид сверху без подписей.',
      },
    ],
    firstSession: [
      'Свободное знакомство с причалом и просьбой Ивы.',
      'Расследование в выбранном игроками порядке: маяк, архив или мастерская.',
      'Выбор у шлюза: исследование, помощь Неры, остановка или необязательный бой.',
      'Возвращение или уход; последствия следуют только из реальных решений.',
    ],
    laterOutline: [
      'Экспедиция к затонувшей башне.',
      'Спор о старых водных путях.',
      'Поиск других устройств наставника.',
    ],
  };
}

function bellEntities(): CampaignEntity[] {
  return [
    location('region', 'Белоречье', 'region', null),
    location('harbor', 'Белая Пристань', 'settlement', 'region'),
    location('dock', 'Причал', 'site', 'harbor'),
    location('lighthouse', 'Маяк', 'building', 'harbor'),
    location('workshop', 'Мастерская', 'building', 'harbor'),
    location('archive', 'Архив', 'building', 'harbor'),
    location('sluice', 'Старый шлюз', 'site', 'region'),
    location('sunken-tower', 'Затонувшая башня', 'site', 'region'),
    {
      ...placed('alena', 'Алёна', 'character', 'dock', 'Следопыт, знакомая с зимней рекой.'),
      sheet: bellRanger(),
    },
    {
      ...placed('borin', 'Борин', 'character', 'dock', 'Маг, изучающий старые механизмы.'),
      sheet: bellWizard(),
    },
    {
      ...placed(
        'darya',
        'Дарья',
        'character',
        'dock',
        'Следопыт, привыкшая помогать путешественникам.',
      ),
      sheet: bellRanger(),
    },
    placed(
      'iva',
      'Ива',
      'npc',
      'lighthouse',
      'Смотрительница хочет сохранить проход по реке и исправить свою ошибку.',
    ),
    placed('arden', 'Арден', 'npc', 'dock', 'Перевозчик хочет безопасный путь для лодок.'),
    placed(
      'nera',
      'Нера',
      'npc',
      'workshop',
      'Мастер хочет исправить устройство и защитить имя наставника.',
    ),
    placed('sev', 'Сев', 'npc', 'archive', 'Хранитель архива охотно помогает искать документы.'),
    placed(
      'copper-dust',
      'Следы медной пыли',
      'feature',
      'dock',
      'Блестящие медные следы на досках.',
    ),
    placed(
      'river-chart',
      'Карта течений',
      'item',
      'lighthouse',
      'На карте отмечено изменение течения выше посёлка.',
    ),
    placed(
      'plan-copy',
      'Копия плана шлюза',
      'item',
      'archive',
      'Доступная копия технического плана.',
    ),
    placed(
      'mentor-note',
      'Записка наставника',
      'item',
      'workshop',
      'Открытая копия записки лежит на верстаке.',
    ),
    placed('sluice-journal', 'Журнал шлюза', 'item', 'sluice', 'Журнал лежит на служебной полке.'),
    placed('resonator', 'Резонатор', 'feature', 'sluice', 'Медный регулятор под защитным кожухом.'),
    {
      ...placed(
        'ice-crab',
        'Ледяной краб',
        'creature',
        'sluice',
        'Речное существо тревожится из-за вибрации.',
      ),
      statBlock: bellCrab(),
    },
  ];
}

function bellKnowledge(): CampaignKnowledge[] {
  return [
    {
      key: 'public-harbor',
      scope: { kind: 'PUBLIC' },
      knowledgeType: 'FACT',
      statement:
        'В Белой Пристани есть причал, маяк, архив и мастерская; здесь работают Ива, Арден, Нера и Сев.',
      subjects: [
        'region',
        'harbor',
        'dock',
        'lighthouse',
        'archive',
        'workshop',
        'iva',
        'arden',
        'nera',
        'sev',
      ],
      knownSince: null,
      relations: [],
    },
    {
      key: 'initial-request',
      scope: { kind: 'PARTY' },
      knowledgeType: 'FACT',
      statement: 'Объявление Ивы просит вернуть журнал старого шлюза.',
      subjects: ['iva', 'sluice-journal'],
      knownSince: 32400,
      relations: [],
    },
    {
      key: 'device-truth',
      scope: { kind: 'WORLD_TRUTH' },
      knowledgeType: 'SECRET',
      statement:
        'Ива запустила оставленный наставником резонатор; его настройка нарушена, и колокол откликается на механизм.',
      subjects: ['iva', 'resonator', 'sunken-tower'],
      knownSince: null,
      relations: [],
    },
    {
      key: 'iva-chart',
      scope: { kind: 'NPC', holder: 'iva' },
      knowledgeType: 'TESTIMONY',
      statement: 'Карта показывает, что течение изменилось у старого шлюза.',
      subjects: ['river-chart', 'sluice'],
      attributedTo: 'iva',
      knownSince: null,
      relations: [],
      disclosure: 'WILLING',
    },
    {
      key: 'iva-confession',
      scope: { kind: 'NPC', holder: 'iva' },
      knowledgeType: 'SECRET',
      statement: 'Я запустила резонатор, пытаясь пробить безопасную полынью.',
      subjects: ['iva', 'resonator'],
      knownSince: null,
      relations: [],
      disclosure: 'GUARDED',
    },
    {
      key: 'arden-rumor',
      scope: { kind: 'NPC', holder: 'arden' },
      knowledgeType: 'RUMOR',
      statement: 'Говорят, Ива навлекла на реку проклятие; я этого не видел.',
      subjects: ['iva', 'dock'],
      attributedTo: 'arden',
      knownSince: null,
      relations: [],
      disclosure: 'WILLING',
    },
    {
      key: 'nera-plan',
      scope: { kind: 'NPC', holder: 'nera' },
      knowledgeType: 'TESTIMONY',
      statement: 'В записке наставника есть способ ручной остановки регулятора.',
      subjects: ['mentor-note', 'resonator'],
      attributedTo: 'nera',
      knownSince: null,
      relations: [],
      disclosure: 'WILLING',
    },
    {
      key: 'sev-copy',
      scope: { kind: 'NPC', holder: 'sev' },
      knowledgeType: 'FACT',
      statement: 'В архиве хранится доступная копия плана старого шлюза.',
      subjects: ['archive', 'plan-copy', 'sluice'],
      knownSince: null,
      relations: [],
      disclosure: 'WILLING',
    },
  ];
}
