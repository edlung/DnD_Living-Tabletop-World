import { createHash } from 'node:crypto';

import { t, type Text } from './text.ts';
import { LANTERN_MAN } from './world.ts';

/**
 * The foes of The Bells of Hollowmere, each a creature from the SRD 5.2.1 bestiary by its ID
 * (docs/adr/0058-campaign-content.md §5–6): created unplaced, its stat block the SRD's, waiting for
 * the prepared encounter that places it. Every foe is met unnamed: its ID is opaque, the same in
 * every copy of the adventure.
 */
export interface Foe {
  readonly id: string;
  readonly monster: string;
  readonly name: Text;
  readonly description: Text;
}

/** An opaque ID that does not change between builds: its kind and eight hex digits of its key. */
export const opaque = (kind: string, key: string): string =>
  `${kind}-${createHash('sha256').update(`hollowmere:${key}`).digest('hex').slice(0, 8)}`;

const foes = (key: string, count: number, monster: string, name: Text, description: Text): Foe[] =>
  Array.from({ length: count }, (_, index) => ({
    id: opaque('creature', `${key}-${String(index + 1)}`),
    monster,
    name,
    description,
  }));

const GOBLIN = t('Goblin Raider', 'Гоблин-налётчик');
const RAT = t('Giant Rat', 'Гигантская крыса');
const DROWNED = t('Drowned Villager', 'Утопленник');
const BONES = t('Chapel Skeleton', 'Скелет из часовни');
const FROG = t('Giant Frog', 'Гигантская лягушка');
const SMUGGLER = t('Reed Cloak Smuggler', 'Контрабандист в тростниковом плаще');
const LOOKOUT = t('Reed Cloak Lookout', 'Дозорный в тростниковом плаще');
const GHOUL = t('Crypt Ghoul', 'Склепный упырь');
const ACOLYTE = t('Ashen Acolyte', 'Пепельный послушник');

/** Chapter 1: the ambush at the Willow Ford, and the rats in the reeve’s cellar. */
export const FORD_GOBLINS = foes(
  'ford-goblin',
  4,
  'goblin-warrior',
  GOBLIN,
  t(
    'A wiry goblin in a stolen sheepskin, a notched blade in one hand.',
    'Жилистый гоблин в краденой овчине, в руке зазубренный клинок.',
  ),
);
export const CELLAR_RATS = [
  ...foes(
    'cellar-rat',
    4,
    'giant-rat',
    RAT,
    t(
      'A rat the size of a dog, slick with marsh-water.',
      'Крыса размером с собаку, мокрая от болотной воды.',
    ),
  ),
  ...foes(
    'cellar-swarm',
    1,
    'swarm-of-rats',
    t('Swarm of Rats', 'Крысиный рой'),
    t(
      'A boiling carpet of rats pouring out of the gnawed floor.',
      'Кипящий ковёр крыс, льющийся из прогрызенного пола.',
    ),
  ),
];

/** Chapter 2: the dead at the Drowned Chapel, and the lights on the marsh. */
export const CHAPEL_DEAD = [
  ...foes(
    'chapel-zombie',
    3,
    'zombie',
    DROWNED,
    t(
      'A grey, swollen body in a reed-cutter’s smock, water running from its mouth.',
      'Серое распухшее тело в рубахе резчика тростника; изо рта течёт вода.',
    ),
  ),
  ...foes(
    'chapel-skeleton',
    2,
    'skeleton',
    BONES,
    t(
      'Old bones in the rags of a chapel guard, a rusted spear in their grip.',
      'Старые кости в лохмотьях стражника часовни, в руке ржавое копьё.',
    ),
  ),
];
export const MARSH_LIGHTS = [
  ...foes(
    'marsh-wisp',
    1,
    'will-o-wisp',
    t('Marsh Light', 'Болотный огонёк'),
    t(
      'A cold, pale light that hums faintly and leads travellers into deep water.',
      'Холодный бледный огонёк: тихо гудит и заводит путников на глубину.',
    ),
  ),
  ...foes(
    'marsh-frog',
    2,
    'giant-frog',
    FROG,
    t(
      'A frog as big as a calf, its tongue quick as a whip.',
      'Лягушка размером с телёнка; язык быстр, как плеть.',
    ),
  ),
];

/** Chapter 3: the Reed Cloaks at the Sunken Mill. Kerra Reed fights with them. */
export const MILL_SMUGGLERS = [
  ...foes(
    'mill-bandit',
    5,
    'bandit',
    SMUGGLER,
    t(
      'A marsh-folk smuggler in a reed cloak, a short blade and a light crossbow at hand.',
      'Контрабандист из топи в тростниковом плаще; под рукой короткий клинок и лёгкий арбалет.',
    ),
  ),
  ...foes(
    'mill-scout',
    2,
    'scout',
    LOOKOUT,
    t(
      'A sharp-eyed lookout with a longbow, perched among the mill’s beams.',
      'Зоркий дозорный с длинным луком, засевший среди балок мельницы.',
    ),
  ),
];

/** Chapter 4: the ghouls on the flooded stair, and the bell chamber's keepers. */
export const STAIR_GHOULS = [
  ...foes(
    'stair-ghoul',
    3,
    'ghoul',
    GHOUL,
    t(
      'A grey, hairless thing crouched in the water, its nails long and black.',
      'Серое безволосое существо, присевшее в воде; когти длинные и чёрные.',
    ),
  ),
  ...foes(
    'stair-acolyte',
    2,
    'cultist',
    ACOLYTE,
    t(
      'A hooded acolyte with ash smeared in a ring on the brow.',
      'Послушник в капюшоне; на лбу кольцо из пепла.',
    ),
  ),
];
export const BELL_KEEPERS = [
  ...foes(
    'bell-knight',
    1,
    'wight',
    t('Drowned Knight', 'Утонувший рыцарь'),
    t(
      'A knight in green-crusted mail risen from the pool, cold light in the holes of its helm.',
      'Рыцарь в позеленевшей кольчуге, поднявшийся из омута; в прорезях шлема холодный свет.',
    ),
  ),
  ...foes(
    'bell-acolyte',
    2,
    'cultist',
    ACOLYTE,
    t(
      'A hooded acolyte with ash smeared in a ring on the brow.',
      'Послушник в капюшоне; на лбу кольцо из пепла.',
    ),
  ),
];

export const ALL_FOES: readonly Foe[] = [
  ...FORD_GOBLINS,
  ...CELLAR_RATS,
  ...CHAPEL_DEAD,
  ...MARSH_LIGHTS,
  ...MILL_SMUGGLERS,
  ...STAIR_GHOULS,
  ...BELL_KEEPERS,
];

/** People of the world who fight with an SRD stat block when it comes to it. */
export const FIGHTING_PEOPLE: readonly { readonly id: string; readonly monster: string }[] = [
  { id: 'kerra-reed', monster: 'bandit-captain' },
  { id: LANTERN_MAN, monster: 'cultist-fanatic' },
];
