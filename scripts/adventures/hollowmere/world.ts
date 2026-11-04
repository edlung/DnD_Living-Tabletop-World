import { STARTS_AT, t, type Text } from './text.ts';

/**
 * The places, people, factions and features of The Bells of Hollowmere: a reed-cutters' village at
 * the edge of the Fogmarsh, a day north of Ravenford, where a bell rings at midnight with no hand
 * on its rope. An entity a player can meet unnamed has an opaque ID (kind and eight hex digits);
 * one whose identity is public a readable one (fixtures/ravenford/AGENTS.md). A description is what
 * anyone who meets the thing sees: secrets live in the DM's knowledge, never here.
 */
export interface Place {
  readonly id: string;
  readonly type: 'region' | 'settlement' | 'district' | 'site' | 'building' | 'room' | 'route';
  readonly parent: string | null;
  readonly name: Text;
  readonly description: Text;
}

export const CAMPAIGN = {
  name: t('The Bells of Hollowmere', 'Холлоумир: колокола в тумане'),
  worldName: t('Ravenford', 'Равенфорд'),
  startsAt: STARTS_AT,
};

/** The hidden crypt and the chamber of the sunken bell: met unnamed. */
export const CRYPT = 'location-5b2e9c47';
export const BELL_CHAMBER = 'location-c81f04da';

export const PLACES: readonly Place[] = [
  {
    id: 'fenlands',
    type: 'region',
    parent: null,
    name: t('The Northern Fens', 'Северные топи'),
    description: t(
      'Willow country and fen north of Ravenford: the Mill Road, Hollowmere and the Fogmarsh.',
      'Ивовый край и топи к северу от Равенфорда: Мельничная дорога, Холлоумир и Туманная топь.',
    ),
  },
  {
    id: 'ravenford',
    type: 'settlement',
    parent: null,
    name: t('Ravenford', 'Равенфорд'),
    description: t(
      'A trading town on the Old Trade Road, walled in grey river-stone.',
      'Торговый город на Старой Торговой дороге, обнесённый стеной из серого речного камня.',
    ),
  },
  {
    id: 'north-gate',
    type: 'district',
    parent: 'ravenford',
    name: t('North Gate', 'Северные ворота'),
    description: t(
      'The town’s northern gate, where wagons bound for the marsh villages are loaded at dawn.',
      'Северные ворота города: на рассвете здесь грузят повозки, идущие в деревни у топи.',
    ),
  },
  {
    id: 'mill-road',
    type: 'route',
    parent: null,
    name: t('The Mill Road', 'Мельничная дорога'),
    description: t(
      'A rutted cart road from Ravenford north through willow country to the edge of the Fogmarsh.',
      'Разбитая колёсами дорога от Равенфорда на север, через ивняк, к краю Туманной топи.',
    ),
  },
  {
    id: 'willow-ford',
    type: 'site',
    parent: 'mill-road',
    name: t('The Willow Ford', 'Ивовый брод'),
    description: t(
      'The Mill Road crosses the Sedge Brook here between leaning willows; the water runs knee-deep and cold.',
      'Здесь Мельничная дорога пересекает Осоковый ручей между склонёнными ивами; вода по колено и холодная.',
    ),
  },
  {
    id: 'hollowmere',
    type: 'settlement',
    parent: null,
    name: t('Hollowmere', 'Холлоумир'),
    description: t(
      'A village of reed-cutters and eel-fishers on stilts and causeways at the edge of the Fogmarsh. A stone bell tower leans over its green.',
      'Деревня тростниковых резчиков и ловцов угрей на сваях и гатях у края Туманной топи. Над лужайкой кренится каменная колокольня.',
    ),
  },
  {
    id: 'reeves-hall',
    type: 'building',
    parent: 'hollowmere',
    name: t('The Reeve’s Hall', 'Дом старосты'),
    description: t(
      'A long timber hall under a turf roof, where the reeve keeps the village tallies and its lamp-oil.',
      'Длинный бревенчатый дом под дёрновой крышей: здесь староста хранит деревенские счёты и лампадное масло.',
    ),
  },
  {
    id: 'reeves-cellar',
    type: 'room',
    parent: 'reeves-hall',
    name: t('The Hall’s Cellar', 'Погреб старосты'),
    description: t(
      'A damp cellar of barrels and salt-sacks; something has gnawed up through the floor from below.',
      'Сырой погреб с бочками и мешками соли; кто-то прогрыз пол снизу.',
    ),
  },
  {
    id: 'bell-tower',
    type: 'building',
    parent: 'hollowmere',
    name: t('The Bell Tower', 'Колокольня'),
    description: t(
      'A squat stone tower older than the village, its bronze bell silent by day. The rope hangs within anyone’s reach.',
      'Приземистая каменная башня старше самой деревни; днём её бронзовый колокол молчит. Верёвка висит так низко, что дотянется любой.',
    ),
  },
  {
    id: 'fogmarsh',
    type: 'region',
    parent: null,
    name: t('The Fogmarsh', 'Туманная топь'),
    description: t(
      'Reed-beds, black pools and drowned alders under a fog that rarely lifts. Lights move there at night.',
      'Тростник, чёрные омуты и утонувшие ольхи под туманом, который редко рассеивается. Ночью там бродят огни.',
    ),
  },
  {
    id: 'drowned-chapel',
    type: 'building',
    parent: 'fogmarsh',
    name: t('The Drowned Chapel', 'Затонувшая часовня'),
    description: t(
      'A chapel on a reedy islet, half sunk since the great flood; its doors are barred from the inside.',
      'Часовня на островке среди тростника, наполовину ушедшая в воду после большого наводнения; двери заперты изнутри.',
    ),
  },
  {
    id: 'sunken-mill',
    type: 'building',
    parent: 'fogmarsh',
    name: t('The Sunken Mill', 'Затопленная мельница'),
    description: t(
      'An old water-mill whose wheel stands in still water; flat boats are tied up beneath its floor.',
      'Старая водяная мельница: колесо стоит в стоячей воде, под полом привязаны плоскодонки.',
    ),
  },
  {
    id: CRYPT,
    type: 'room',
    parent: 'drowned-chapel',
    name: t('Flooded Crypt', 'Затопленный склеп'),
    description: t(
      'Stone stairs go down into black water and a vaulted crypt where the old saints were laid.',
      'Каменные ступени уходят в чёрную воду, к сводчатому склепу, где хоронили древних святых.',
    ),
  },
  {
    id: BELL_CHAMBER,
    type: 'room',
    parent: CRYPT,
    name: t('Chamber of the Sunken Bell', 'Зал утонувшего колокола'),
    description: t(
      'A round chamber below the crypt where a second, older bell hangs over a pool, its clapper green with copper.',
      'Круглый зал под склепом: над омутом висит второй, более древний колокол, его язык позеленел от меди.',
    ),
  },
];

export interface Person {
  readonly id: string;
  readonly kind: 'npc' | 'faction' | 'feature' | 'item';
  /** Where it stands; factions have no place. */
  readonly at: string | null;
  readonly name: Text;
  readonly description: Text;
}

/** The hooded lantern-bearer who rings the sunken bell: met unnamed. */
export const LANTERN_MAN = 'npc-7c3e91a2';
export const REED_CLOAKS = 'faction-3d7a52e8';
export const ASHEN_CIRCLE = 'faction-a6c41f09';

export const PEOPLE: readonly Person[] = [
  {
    id: 'agna-brisk',
    kind: 'npc',
    at: 'north-gate',
    name: t('Agna Brisk', 'Агна Бриск'),
    description: t(
      'A lamp-oil merchant’s widow, brisk as her name, with ink on her fingers and no patience for excuses.',
      'Вдова торговца лампадным маслом: деловитая, пальцы в чернилах, оправданий не терпит.',
    ),
  },
  {
    id: 'hobb-fenwick',
    kind: 'npc',
    at: 'reeves-hall',
    name: t('Hobb Fenwick', 'Хобб Фенвик'),
    description: t(
      'Hollowmere’s reeve, a heavy, tired man who counts everything twice and has slept badly since the bell began.',
      'Староста Холлоумира: грузный, усталый, всё пересчитывает дважды и плохо спит с тех пор, как зазвонил колокол.',
    ),
  },
  {
    id: 'sister-ilse',
    kind: 'npc',
    at: 'hollowmere',
    name: t('Sister Ilse', 'Сестра Ильзе'),
    description: t(
      'Keeper of the drowned saint’s shrine, now kept in a fisher’s hut; sharp-eyed, devout and afraid of nothing living.',
      'Хранительница святыни утонувшего святого, которую теперь держат в рыбацкой хижине; зоркая, набожная и не боится ничего живого.',
    ),
  },
  {
    id: 'kerra-reed',
    kind: 'npc',
    at: 'sunken-mill',
    name: t('Kerra Reed', 'Керра Рид'),
    description: t(
      'A ferrywoman in a cloak of woven reeds, a boat-hook on her shoulder; she knows every channel of the marsh.',
      'Перевозчица в плаще из плетёного тростника, с багром на плече; знает каждую протоку топи.',
    ),
  },
  {
    id: 'old-matthis',
    kind: 'npc',
    at: CRYPT,
    name: t('Old Matthis', 'Старый Маттис'),
    description: t(
      'Hollowmere’s bell-ringer, white-bearded and half-deaf after fifty years of bells.',
      'Звонарь Холлоумира: белобородый, полуглухой после полувека колоколов.',
    ),
  },
  {
    id: LANTERN_MAN,
    kind: 'npc',
    at: BELL_CHAMBER,
    name: t('Hooded Lantern-Bearer', 'Фонарщик в капюшоне'),
    description: t(
      'A gaunt figure in a grey hood carrying a lantern whose light never flickers.',
      'Тощая фигура в сером капюшоне; в руке фонарь, чей свет никогда не дрожит.',
    ),
  },
  {
    id: REED_CLOAKS,
    kind: 'faction',
    at: null,
    name: t('The Reed Cloaks', 'Тростниковые плащи'),
    description: t(
      'Marsh-folk who move goods along the channels by night, untaxed and unasked.',
      'Жители топи, что ночами возят грузы по протокам, без пошлин и без вопросов.',
    ),
  },
  {
    id: ASHEN_CIRCLE,
    kind: 'faction',
    at: null,
    name: t('The Ashen Circle', 'Пепельный круг'),
    description: t(
      'Hooded zealots who mark their deeds with a ring of ash.',
      'Фанатики в капюшонах, отмечающие свои дела кольцом из пепла.',
    ),
  },
  {
    id: 'hollowmere-bell',
    kind: 'feature',
    at: 'bell-tower',
    name: t('The Hollowmere Bell', 'Колокол Холлоумира'),
    description: t(
      'A bronze bell green with age. Three nights running it rang at midnight with no hand on its rope.',
      'Бронзовый колокол, позеленевший от времени. Три ночи подряд он звонил в полночь, хотя верёвку никто не тянул.',
    ),
  },
  {
    id: 'feature-1e6b3d90',
    kind: 'feature',
    at: 'bell-tower',
    name: t('Bell Rope', 'Верёвка колокола'),
    description: t(
      'A thick hemp rope, frayed and stained green at the knot where it was mended.',
      'Толстая пеньковая верёвка, разлохмаченная и позеленевшая там, где её связали узлом.',
    ),
  },
  {
    id: 'feature-8a2f6c14',
    kind: 'feature',
    at: 'willow-ford',
    name: t('Churned Mud', 'Взрытая грязь'),
    description: t(
      'The bank of the ford is trampled by many small feet and scored where something was dragged.',
      'Берег у брода истоптан множеством маленьких ног и изборождён там, где что-то волокли.',
    ),
  },
  {
    id: 'feature-0d9b5e72',
    kind: 'feature',
    at: 'drowned-chapel',
    name: t('The Drowned Altar', 'Затонувший алтарь'),
    description: t(
      'A stone altar standing in a hand’s depth of water, its carvings of bells worn smooth.',
      'Каменный алтарь стоит в воде глубиной в ладонь; резные колокола на нём стёрлись до гладкости.',
    ),
  },
  {
    id: 'feature-f3c7a185',
    kind: 'feature',
    at: 'drowned-chapel',
    name: t('Cracked Floor-Slab', 'Треснувшая плита'),
    description: t(
      'A broad slab before the altar, cracked across, with a small bell carved in one corner.',
      'Широкая плита перед алтарём, треснувшая поперёк; в одном углу вырезан маленький колокол.',
    ),
  },
  {
    id: 'feature-b57d2e3a',
    kind: 'feature',
    at: 'fogmarsh',
    name: t('Marsh Lights', 'Болотные огни'),
    description: t(
      'Pale lights that drift over the reed-beds and draw back when approached.',
      'Бледные огни плывут над тростником и отступают, если к ним подойти.',
    ),
  },
  {
    id: 'feature-6e0a4bd2',
    kind: 'feature',
    at: BELL_CHAMBER,
    name: t('The Sunken Bell', 'Утонувший колокол'),
    description: t(
      'An ancient bell hung low over black water; when it moves, the water shivers before any sound comes.',
      'Древний колокол низко висит над чёрной водой; когда он качается, вода вздрагивает раньше, чем приходит звук.',
    ),
  },
];

/** The scene the adventure opens on: Agna Brisk’s wagon at Ravenford’s North Gate. */
export const OPENING = {
  sceneId: 'hollowmere-departure',
  title: t('A Wagon for Hollowmere', 'Повозка в Холлоумир'),
  locationId: 'north-gate',
};
