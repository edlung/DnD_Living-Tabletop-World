import {
  BELL_KEEPERS,
  CELLAR_RATS,
  CHAPEL_DEAD,
  FORD_GOBLINS,
  MARSH_LIGHTS,
  MILL_SMUGGLERS,
  STAIR_GHOULS,
  type Foe,
} from './foes.ts';
import { t, type Text } from './text.ts';
import { BELL_CHAMBER, CRYPT, LANTERN_MAN } from './world.ts';

/**
 * The quest book and the prepared encounters of The Bells of Hollowmere (ADR 0025 §2; ADR 0015,
 * 2026-11-02 amendment): content beside the world that a campaign of this adventure reads, never
 * state. Each quest is a projection of what the party knows and did; each encounter is ready for
 * a party of four at the level its chapter is played at.
 */
type Milestone =
  | { readonly kind: 'reached' | 'examined-at' | 'survived-fight-at'; readonly locationId: string }
  | { readonly kind: 'hypothesized'; readonly subject: string }
  | { readonly kind: 'told-by'; readonly informant: string; readonly subject: string }
  | { readonly kind: 'returned-to'; readonly locationId: string; readonly after: string };

export interface Quest {
  readonly questId: string;
  readonly title: Text;
  readonly activation: { readonly subject: string; readonly summary: Text };
  readonly milestones: readonly (Milestone & { readonly stage: string; readonly summary: Text })[];
  readonly completion: string;
}

export const QUESTS: readonly Quest[] = [
  {
    questId: 'widows-wagon',
    title: t('The Widow’s Wagon', 'Повозка вдовы'),
    activation: {
      subject: 'brisk-cargo',
      summary: t(
        'Agna Brisk offered us work taking her wagon to Hollowmere.',
        'Агна Бриск предложила нам отвезти её повозку в Холлоумир.',
      ),
    },
    milestones: [
      {
        stage: 'ford-visited',
        kind: 'reached',
        locationId: 'willow-ford',
        summary: t('We reached the Willow Ford.', 'Мы добрались до Ивового брода.'),
      },
      {
        stage: 'village-visited',
        kind: 'reached',
        locationId: 'hollowmere',
        summary: t('Our party reached Hollowmere.', 'Наш отряд добрался до Холлоумира.'),
      },
      {
        stage: 'reeve-heard',
        kind: 'told-by',
        informant: 'hobb-fenwick',
        subject: 'hollowmere-bell',
        summary: t(
          'The reeve told us why he stopped writing.',
          'Староста рассказал нам, почему перестал писать.',
        ),
      },
    ],
    completion: 'reeve-heard',
  },
  {
    questId: 'bells-of-hollowmere',
    title: t('The Bells of Hollowmere', 'Колокола Холлоумира'),
    activation: {
      subject: 'hollowmere-bell',
      summary: t(
        'We learned that the bell of Hollowmere rings at midnight with no hand on its rope.',
        'Мы узнали, что колокол Холлоумира звонит в полночь, хотя верёвку никто не тянет.',
      ),
    },
    milestones: [
      {
        stage: 'tower-examined',
        kind: 'examined-at',
        locationId: 'bell-tower',
        summary: t('We examined the bell tower.', 'Мы осмотрели колокольню.'),
      },
      {
        stage: 'bell-theory',
        kind: 'hypothesized',
        subject: 'hollowmere-bell',
        summary: t(
          'We formed a theory about who rings the bell.',
          'У нас появилась догадка, кто звонит в колокол.',
        ),
      },
      {
        stage: 'chapel-cleared',
        kind: 'survived-fight-at',
        locationId: 'drowned-chapel',
        summary: t(
          'We survived a confrontation in the chapel grounds or beneath them.',
          'Мы пережили столкновение на территории Затонувшей часовни или под ней.',
        ),
      },
      {
        stage: 'mill-faced',
        kind: 'survived-fight-at',
        locationId: 'sunken-mill',
        summary: t(
          'We survived a confrontation at the Sunken Mill.',
          'Мы пережили столкновение на Затопленной мельнице.',
        ),
      },
      {
        stage: 'way-down',
        kind: 'reached',
        locationId: CRYPT,
        summary: t('We found the way down beneath the chapel.', 'Мы нашли путь вниз под часовней.'),
      },
      {
        stage: 'chamber-visited',
        kind: 'reached',
        locationId: BELL_CHAMBER,
        summary: t(
          'We reached the chamber of the sunken bell.',
          'Мы добрались до зала утонувшего колокола.',
        ),
      },
      {
        stage: 'word-brought',
        kind: 'returned-to',
        locationId: 'hollowmere',
        after: 'chamber-visited',
        summary: t(
          'After visiting the bell chamber, we are back in Hollowmere.',
          'После посещения зала колокола мы снова в Холлоумире.',
        ),
      },
    ],
    completion: 'word-brought',
  },
  {
    questId: 'old-matthis',
    title: t('The Missing Bell-Ringer', 'Пропавший звонарь'),
    activation: {
      subject: 'old-matthis',
      summary: t(
        'We learned that Old Matthis, the bell-ringer, is missing.',
        'Мы узнали, что пропал звонарь, Старый Маттис.',
      ),
    },
    milestones: [
      {
        stage: 'ilse-heard',
        kind: 'told-by',
        informant: 'sister-ilse',
        subject: 'old-matthis',
        summary: t(
          'Sister Ilse told us where Matthis went.',
          'Сестра Ильзе рассказала нам, куда ушёл Маттис.',
        ),
      },
      {
        stage: 'crypt-visited',
        kind: 'reached',
        locationId: CRYPT,
        summary: t('Our search took us to the crypt.', 'Поиски привели нас в склеп.'),
      },
      {
        stage: 'return-from-search',
        kind: 'returned-to',
        locationId: 'hollowmere',
        after: 'crypt-visited',
        summary: t(
          'We returned to the village after visiting the crypt.',
          'После посещения склепа мы вернулись в деревню.',
        ),
      },
    ],
    completion: 'return-from-search',
  },
];

interface Square {
  readonly x: number;
  readonly y: number;
}

export interface Encounter {
  readonly encounterId: string;
  readonly title: Text;
  readonly summary: Text;
  readonly locationId: string;
  readonly width: number;
  readonly height: number;
  readonly difficult: readonly Square[];
  readonly cover: readonly (Square & { readonly level: 'half' | 'three-quarters' | 'total' })[];
  readonly foes: readonly {
    readonly entityId: string;
    readonly position: Square;
    readonly minPartySize?: number;
  }[];
  readonly partyStart: readonly Square[];
}

/** Squares of a column or a row, for water and walls. */
const column = (x: number, from: number, to: number): Square[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x, y: from + index }));
const row = (y: number, from: number, to: number): Square[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));
/** Each foe of a group at its square, in order. */
const placed = (group: readonly Foe[], squares: readonly (Square & { minPartySize?: number })[]) =>
  group.map((foe, index) => {
    const { x, y, minPartySize } = squares[index] ?? { x: 0, y: 0 };
    return { entityId: foe.id, position: { x, y }, ...(minPartySize ? { minPartySize } : {}) };
  });
const FOUR = (x: number, y: number): Square[] => [
  { x, y },
  { x, y: y + 1 },
  { x: x + 1, y },
  { x: x + 1, y: y + 1 },
];

export const ENCOUNTERS: readonly Encounter[] = [
  {
    encounterId: 'willow-ford-ambush',
    title: t('Ambush at the Willow Ford', 'Засада у Ивового брода'),
    summary: t(
      'At level 1 there are four raiders, or three for three heroes. At half strength they flee. At the end of round 3 they leave with one crate. Yield it earlier to save the wounded. Sixteen miles on, Hobb offers a night’s rest before the cellar.',
      'На 1-м уровне налётчиков четверо, на троих героев выходят трое. При потере половины налётчики бегут. После 3-го раунда они уйдут с ящиком. Можно уступить его раньше и вывезти раненых. Через шестнадцать миль Хобб предложит постели до открытия погреба.',
    ),
    locationId: 'willow-ford',
    width: 14,
    height: 10,
    difficult: [...column(6, 0, 9), ...column(7, 0, 9)],
    cover: [
      { x: 9, y: 1, level: 'half' },
      { x: 11, y: 7, level: 'half' },
      { x: 4, y: 8, level: 'three-quarters' },
    ],
    foes: placed(FORD_GOBLINS, [
      { x: 10, y: 2 },
      { x: 12, y: 4 },
      { x: 11, y: 6 },
      { x: 9, y: 8, minPartySize: 4 },
    ]),
    partyStart: FOUR(2, 4),
  },
  {
    encounterId: 'cellar-rats',
    title: t('Rats in the Reeve’s Cellar', 'Крысы в погребе старосты'),
    summary: t(
      'Four level-1 heroes face four giant rats and a swarm. Three face two rats and the swarm. Plug the breach with a cask at G4 in two adjacent actions or help Hobb seal the cellar from above, sacrificing the salt. Either earns the milestone.',
      'На четверых героев 1-го уровня выходят четыре крысы и рой, на троих — две крысы и рой. Два действия у бочки в G4 закроют лаз. При отступлении помогите Хоббу заделать его сверху ценой оставшейся соли. В обоих случаях засчитайте веху погреба.',
    ),
    locationId: 'reeves-cellar',
    width: 10,
    height: 8,
    difficult: [
      { x: 8, y: 3 },
      { x: 8, y: 4 },
    ],
    cover: [
      { x: 4, y: 2, level: 'half' },
      { x: 4, y: 5, level: 'half' },
    ],
    foes: placed(CELLAR_RATS, [
      { x: 7, y: 1 },
      { x: 7, y: 6 },
      { x: 6, y: 3, minPartySize: 4 },
      { x: 6, y: 5, minPartySize: 4 },
      { x: 8, y: 5 },
    ]),
    partyStart: FOUR(1, 3),
  },
  {
    encounterId: 'drowned-chapel',
    title: t('The Dead of the Drowned Chapel', 'Мертвецы Затонувшей часовни'),
    summary: t(
      'Drowned villagers rise from the flooded nave while two old guards stand by the altar. For a party of four at level 2. The inscription on the porch marks the way below. Heroes who pull their wounded back to the boat can copy it from the landing and earn the chapel milestone. The dead stay in the nave. The dry porch or the boat in the reeds gives the party an hour before it enters the marsh.',
      'Утопленники поднимаются из затопленного нефа, а у алтаря стоят двое древних стражей. Для отряда из четырёх на 2-м уровне. Надпись на паперти указывает путь вниз. Если герои отступят с ранеными к лодке, надпись можно срисовать с мостков и получить веху часовни. Мертвецы останутся в нефе. На сухой паперти или в лодке за камышом есть час до выхода в топь.',
    ),
    locationId: 'drowned-chapel',
    width: 14,
    height: 12,
    difficult: [...row(8, 3, 13), ...row(9, 3, 13), ...row(10, 3, 13), ...row(11, 3, 13)],
    cover: [
      { x: 5, y: 3, level: 'half' },
      { x: 5, y: 6, level: 'half' },
      { x: 12, y: 5, level: 'three-quarters' },
    ],
    foes: placed(CHAPEL_DEAD, [
      { x: 8, y: 4 },
      { x: 10, y: 6 },
      { x: 9, y: 9 },
      { x: 12, y: 2 },
      { x: 12, y: 8 },
    ]),
    partyStart: FOUR(1, 5),
  },
  {
    encounterId: 'marsh-lights',
    title: t('Lights on the Marsh', 'Огни над топью'),
    summary: t(
      'A marsh light lures the party off the channel while giant frogs wait in the reeds. For a party of four at level 2. The frogs stay in the reeds. The party can retreat along its pole marks as soon as it has enough hands to pull the wounded aboard. It loses daylight and returns by the long channel.',
      'Болотный огонёк уводит отряд с протоки, а в тростнике поджидают гигантские лягушки. Для отряда из четырёх на 2-м уровне. Лягушки держатся камыша. Герои могут погрузить раненых в лодку и отступить по зарубкам от шеста. Длинный обратный проток стоит им остатка светлого дня.',
    ),
    locationId: 'fogmarsh',
    width: 16,
    height: 12,
    difficult: [
      ...column(5, 0, 11),
      ...column(6, 0, 11),
      ...column(10, 0, 11),
      ...column(11, 0, 11),
    ],
    cover: [{ x: 8, y: 2, level: 'half' }],
    foes: placed(MARSH_LIGHTS, [
      { x: 13, y: 3 },
      { x: 9, y: 7 },
      { x: 12, y: 9 },
    ]),
    partyStart: FOUR(1, 5),
  },
  {
    encounterId: 'sunken-mill',
    title: t('The Reed Cloaks at the Sunken Mill', 'Тростниковые плащи на Затопленной мельнице'),
    summary: t(
      'At level 3 Kerra has two smugglers and a lookout. With three heroes only one smuggler fights beside her. Below half HP she offers the passage and one healing potion for her crew’s safe exit. After a retreat the ledger can still be reached through the loading hatch.',
      'У Керры два контрабандиста и дозорный. Против троих героев 3-го уровня рядом с ней сражается один контрабандист. Ниже половины хитов она предложит спуск и одно зелье лечения за свободный выход команды. При отступлении книгу можно прочесть через погрузочный люк.',
    ),
    locationId: 'sunken-mill',
    width: 16,
    height: 12,
    difficult: [...column(13, 0, 11), ...column(14, 0, 11), ...column(15, 0, 11)],
    cover: [
      { x: 12, y: 5, level: 'total' },
      { x: 12, y: 6, level: 'total' },
      { x: 7, y: 2, level: 'half' },
      { x: 7, y: 9, level: 'half' },
    ],
    foes: [
      { entityId: 'kerra-reed', position: { x: 11, y: 6 } },
      ...placed(MILL_SMUGGLERS.filter((foe) => foe.monster === 'bandit').slice(0, 2), [
        { x: 9, y: 3 },
        { x: 10, y: 8, minPartySize: 4 },
      ]),
      ...placed(MILL_SMUGGLERS.filter((foe) => foe.monster === 'scout').slice(0, 1), [
        { x: 14, y: 1, minPartySize: 4 },
      ]),
    ],
    partyStart: FOUR(1, 5),
  },
  {
    encounterId: 'flooded-stair',
    title: t('The Flooded Stair', 'Затопленная лестница'),
    summary: t(
      'Ghouls and two acolytes guard the flooded stair at level 4. Two actions at E5 shut the sluice grate. The side sacristy offers one hour behind a bar, at the cost of the last smuggling boat. Its service door leads to the bell.',
      'Упыри и двое послушников стерегут лестницу на 4-м уровне. Два действия у E5 опустят решётку. Через ризницу можно отступить. Её засов даст час на отдых, а Фонарщик за это время отпустит последнюю лодку. Служебная дверь ведёт к колоколу.',
    ),
    locationId: CRYPT,
    width: 12,
    height: 10,
    difficult: [...column(5, 0, 9), ...column(6, 0, 9), ...column(7, 0, 9)],
    cover: [
      { x: 3, y: 2, level: 'half' },
      { x: 3, y: 7, level: 'half' },
    ],
    foes: placed(STAIR_GHOULS, [
      { x: 6, y: 3 },
      { x: 7, y: 5 },
      { x: 6, y: 7 },
      { x: 10, y: 4 },
      { x: 10, y: 6 },
    ]),
    partyStart: FOUR(1, 4),
  },
  {
    encounterId: 'sunken-bell',
    title: t('The Chamber of the Sunken Bell', 'Зал утонувшего колокола'),
    summary: t(
      'Four level-4 heroes face the knight, lantern-bearer and two acolytes. For three heroes the knight and one acolyte guard the pool while the others hold the ropes. An action at G5 to slacken the rope and one at I6 to bind the clapper silence the bell. Rescuing the prisoners is a separate choice.',
      'Против четверых героев 4-го уровня выходят рыцарь, Фонарщик и два послушника. На троих омут держат рыцарь и один послушник, остальные держат канаты. Действие у G5 ослабляет канат, другое у I6 связывает язык. Это заглушит колокол. Пленников можно вывести отдельно.',
    ),
    locationId: BELL_CHAMBER,
    width: 14,
    height: 12,
    difficult: [...row(5, 6, 9), ...row(6, 6, 9), ...row(7, 6, 9)],
    cover: [
      { x: 4, y: 2, level: 'three-quarters' },
      { x: 4, y: 9, level: 'three-quarters' },
      { x: 11, y: 2, level: 'three-quarters' },
      { x: 11, y: 9, level: 'three-quarters' },
    ],
    foes: [
      ...placed(BELL_KEEPERS, [
        { x: 8, y: 6 },
        { x: 10, y: 8 },
        { x: 10, y: 4, minPartySize: 4 },
      ]),
      { entityId: LANTERN_MAN, position: { x: 12, y: 6 }, minPartySize: 4 },
    ],
    partyStart: FOUR(1, 5),
  },
];
