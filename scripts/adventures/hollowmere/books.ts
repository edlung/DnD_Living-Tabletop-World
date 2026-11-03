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
        'Agna Brisk hired us to take her wagon to Hollowmere.',
        'Агна Бриск наняла нас отвезти её повозку в Холлоумир.',
      ),
    },
    milestones: [
      {
        stage: 'ford-crossed',
        kind: 'survived-fight-at',
        locationId: 'willow-ford',
        summary: t('We fought our way across the Willow Ford.', 'Мы с боем прошли Ивовый брод.'),
      },
      {
        stage: 'wagon-delivered',
        kind: 'reached',
        locationId: 'hollowmere',
        summary: t('We brought the wagon to Hollowmere.', 'Мы довезли повозку до Холлоумира.'),
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
          'We faced the dead at the Drowned Chapel.',
          'Мы сразились с мертвецами Затонувшей часовни.',
        ),
      },
      {
        stage: 'mill-faced',
        kind: 'survived-fight-at',
        locationId: 'sunken-mill',
        summary: t(
          'We faced the Reed Cloaks at the Sunken Mill.',
          'Мы сошлись с Тростниковыми плащами на Затопленной мельнице.',
        ),
      },
      {
        stage: 'way-down',
        kind: 'reached',
        locationId: CRYPT,
        summary: t('We found the way down beneath the chapel.', 'Мы нашли путь вниз под часовней.'),
      },
      {
        stage: 'bell-silenced',
        kind: 'survived-fight-at',
        locationId: BELL_CHAMBER,
        summary: t('We silenced the sunken bell.', 'Мы заставили утонувший колокол умолкнуть.'),
      },
      {
        stage: 'word-brought',
        kind: 'returned-to',
        locationId: 'hollowmere',
        after: 'bell-silenced',
        summary: t('We brought word back to Hollowmere.', 'Мы вернулись в Холлоумир с вестями.'),
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
        stage: 'matthis-found',
        kind: 'reached',
        locationId: CRYPT,
        summary: t('We found Old Matthis in the crypt.', 'Старый Маттис нашёлся в склепе.'),
      },
      {
        stage: 'matthis-home',
        kind: 'returned-to',
        locationId: 'hollowmere',
        after: 'matthis-found',
        summary: t('We brought Old Matthis home.', 'Старый Маттис снова дома.'),
      },
    ],
    completion: 'matthis-home',
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
  readonly foes: readonly { readonly entityId: string; readonly position: Square }[];
  readonly partyStart: readonly Square[];
}

/** Squares of a column or a row, for water and walls. */
const column = (x: number, from: number, to: number): Square[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x, y: from + index }));
const row = (y: number, from: number, to: number): Square[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));
/** Each foe of a group at its square, in order. */
const placed = (group: readonly Foe[], squares: readonly Square[]) =>
  group.map((foe, index) => ({ entityId: foe.id, position: squares[index] ?? { x: 0, y: 0 } }));
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
      'Four goblin raiders leap from the willows as the wagon fords the brook. For a party of four at level 1.',
      'Четверо гоблинов-налётчиков выскакивают из ив, когда повозка переходит ручей вброд. Для отряда из четырёх на 1-м уровне.',
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
      { x: 9, y: 8 },
    ]),
    partyStart: FOUR(2, 4),
  },
  {
    encounterId: 'cellar-rats',
    title: t('Rats in the Reeve’s Cellar', 'Крысы в погребе старосты'),
    summary: t(
      'Giant rats and a boiling swarm pour from the gnawed floor among the barrels. For a party of four at level 1.',
      'Гигантские крысы и кипящий рой лезут из прогрызенного пола между бочек. Для отряда из четырёх на 1-м уровне.',
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
      { x: 6, y: 3 },
      { x: 6, y: 5 },
      { x: 8, y: 5 },
    ]),
    partyStart: FOUR(1, 3),
  },
  {
    encounterId: 'drowned-chapel',
    title: t('The Dead of the Drowned Chapel', 'Мертвецы Затонувшей часовни'),
    summary: t(
      'Drowned villagers rise from the flooded nave while two old guards stand by the altar. For a party of four at level 2.',
      'Утопленники поднимаются из затопленного нефа, а у алтаря стоят двое древних стражей. Для отряда из четырёх на 2-м уровне.',
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
      'A marsh light lures the party off the channel while giant frogs wait in the reeds. For a party of four at level 2.',
      'Болотный огонёк уводит отряд с протоки, а в тростнике поджидают гигантские лягушки. Для отряда из четырёх на 2-м уровне.',
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
      'Kerra Reed and her smugglers hold the mill floor, with lookouts in the beams above the wheel. For a party of four at level 3.',
      'Керра Рид и её контрабандисты держат пол мельницы, а дозорные засели на балках над колесом. Для отряда из четырёх на 3-м уровне.',
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
      ...placed(MILL_SMUGGLERS, [
        { x: 9, y: 3 },
        { x: 10, y: 8 },
        { x: 8, y: 5 },
        { x: 11, y: 3 },
        { x: 11, y: 9 },
        { x: 14, y: 1 },
        { x: 14, y: 10 },
      ]),
    ],
    partyStart: FOUR(1, 5),
  },
  {
    encounterId: 'flooded-stair',
    title: t('The Flooded Stair', 'Затопленная лестница'),
    summary: t(
      'Ghouls crouch in the black water of the crypt while two ash-marked acolytes keep the way to the chamber below. For a party of four at level 4.',
      'Упыри притаились в чёрной воде склепа, а двое послушников с пепельной меткой стерегут путь в зал внизу. Для отряда из четырёх на 4-м уровне.',
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
      'The hooded lantern-bearer rings the sunken bell, and the drowned knight rises from the pool with two acolytes beside him. For a party of four at level 4.',
      'Фонарщик в капюшоне бьёт в утонувший колокол, и из омута поднимается утонувший рыцарь; рядом с ним двое послушников. Для отряда из четырёх на 4-м уровне.',
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
        { x: 10, y: 4 },
      ]),
      { entityId: LANTERN_MAN, position: { x: 12, y: 6 } },
    ],
    partyStart: FOUR(1, 5),
  },
];
