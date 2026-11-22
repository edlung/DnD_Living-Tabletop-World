import { BELL_KEEPERS } from './foes.ts';
import { STARTS_AT, t, type Text } from './text.ts';
import { ASHEN_CIRCLE, BELL_CHAMBER, CRYPT, LANTERN_MAN, REED_CLOAKS } from './world.ts';

/**
 * What the world of The Bells of Hollowmere knows (ADR 0010's scopes): the rumours everyone hears,
 * the party's hire, what each person of the world knows and whether they tell it willingly, the
 * world's truths and the DM's notes, and the clues the party finds by looking, by a check, or by
 * Detect Magic (ADR 0012). Records name only entities that exist from the start.
 */
type Scope =
  | { readonly kind: 'PUBLIC' | 'PARTY' | 'DM' | 'WORLD_TRUTH' }
  | { readonly kind: 'NPC'; readonly npcId: string };

export interface Knowledge {
  readonly id: string;
  readonly scope: Scope;
  readonly type: 'FACT' | 'RUMOR' | 'TESTIMONY' | 'SECRET';
  readonly statement: Text;
  readonly subjects: readonly string[];
  readonly attributedTo?: string;
  /** An NPC's record: told when asked, or kept until pressed. */
  readonly disclosure?: 'WILLING' | 'GUARDED';
  readonly knownSince: number | null;
}

const DAY = 24 * 3600;
const npc = (npcId: string): Scope => ({ kind: 'NPC', npcId });
/** The drowned knight in the pool beneath the crypt. */
export const KNIGHT = BELL_KEEPERS[0]?.id ?? 'creature-unknown';

export const KNOWLEDGE: readonly Knowledge[] = [
  {
    id: 'public-road-map',
    scope: { kind: 'PUBLIC' },
    type: 'FACT',
    statement: t(
      'At the North Gate of Ravenford, a noticeboard shows the Northern Fens and the Mill Road to Hollowmere. A traveller can copy the map before setting out.',
      'У Северных ворот Равенфорда висит карта Северных топей с Мельничной дорогой до Холлоумира. Путник может срисовать её перед отъездом.',
    ),
    subjects: ['fenlands', 'ravenford', 'north-gate', 'hollowmere'],
    knownSince: null,
  },
  {
    id: 'pub-hollowmere',
    scope: { kind: 'PUBLIC' },
    type: 'FACT',
    statement: t(
      'Hollowmere is a village of reed-cutters and eel-fishers at the edge of the Fogmarsh, a day’s ride north of Ravenford by the Mill Road.',
      'Холлоумир — деревня тростниковых резчиков и ловцов угрей у края Туманной топи, в дне пути на север от Равенфорда по Мельничной дороге.',
    ),
    subjects: ['hollowmere', 'mill-road', 'fogmarsh'],
    knownSince: null,
  },
  {
    id: 'pub-bell-rumour',
    scope: { kind: 'PUBLIC' },
    type: 'RUMOR',
    statement: t(
      'Folk say the bell of Hollowmere rang at midnight three nights running, with no one at the rope.',
      'Говорят, колокол Холлоумира три ночи подряд звонил в полночь, и никого не было у верёвки.',
    ),
    subjects: ['hollowmere-bell', 'hollowmere'],
    knownSince: STARTS_AT - 2 * DAY,
  },
  {
    id: 'pub-chapel-flood',
    scope: { kind: 'PUBLIC' },
    type: 'FACT',
    statement: t(
      'The Drowned Chapel has stood half under water since the great flood thirty years ago.',
      'Затонувшая часовня стоит наполовину в воде со времён большого наводнения, тридцать лет назад.',
    ),
    subjects: ['drowned-chapel', 'fogmarsh'],
    knownSince: null,
  },
  {
    id: 'pub-ford-goblins',
    scope: { kind: 'PUBLIC' },
    type: 'RUMOR',
    statement: t(
      'Goblins have come down from the hills to rob carts at the Willow Ford.',
      'С холмов спустились гоблины и грабят повозки у Ивового брода.',
    ),
    subjects: ['willow-ford', 'mill-road'],
    knownSince: STARTS_AT - 5 * DAY,
  },
  {
    id: 'party-brisk-hire',
    scope: { kind: 'PARTY' },
    type: 'FACT',
    statement: t(
      'Agna Brisk asked whether we would take her wagon of lamp-oil and salt to Hollowmere and find out why its reeve has stopped writing.',
      'Агна Бриск предложила нам отвезти её повозку с лампадным маслом и солью в Холлоумир и узнать, почему тамошний староста перестал писать.',
    ),
    subjects: ['brisk-cargo', 'agna-brisk', 'hollowmere', 'hobb-fenwick'],
    knownSince: STARTS_AT,
  },
  {
    id: 'agna-letters',
    scope: npc('agna-brisk'),
    type: 'FACT',
    statement: t(
      'Reeve Fenwick wrote every month for oil. His last letter, a month ago, spoke of the bell and asked for a priest.',
      'Староста Фенвик писал каждый месяц, заказывая масло. Последнее письмо, месяц назад, было о колоколе и с просьбой прислать священника.',
    ),
    subjects: ['hobb-fenwick', 'hollowmere-bell'],
    disclosure: 'WILLING',
    knownSince: STARTS_AT - 30 * DAY,
  },
  {
    id: 'hobb-bell',
    scope: npc('hobb-fenwick'),
    type: 'TESTIMONY',
    statement: t(
      'The bell rang at midnight three nights running. Old Matthis, the ringer, went up to watch it on the third night and has not come back.',
      'Колокол звонил в полночь три ночи подряд. Старый Маттис, звонарь, на третью ночь поднялся его караулить и не вернулся.',
    ),
    subjects: ['hollowmere-bell', 'old-matthis', 'bell-tower'],
    attributedTo: 'hobb-fenwick',
    disclosure: 'WILLING',
    knownSince: STARTS_AT - DAY,
  },
  {
    id: 'hobb-cellar',
    scope: npc('hobb-fenwick'),
    type: 'FACT',
    statement: t(
      'Something has been eating the salt and the oil in the hall’s cellar, and nobody will go down there now.',
      'Кто-то поедает соль и масло в погребе старосты, и теперь туда никто не спускается.',
    ),
    subjects: ['reeves-cellar'],
    disclosure: 'WILLING',
    knownSince: STARTS_AT - 3 * DAY,
  },
  {
    id: 'hobb-silver',
    scope: npc('hobb-fenwick'),
    type: 'SECRET',
    statement: t(
      'Hobb takes a share of the silver the Reed Cloaks pay to land their boats at Hollowmere, and keeps quiet about their night trips into the marsh.',
      'Хобб получает долю серебра, которое Тростниковые плащи платят за стоянку лодок в Холлоумире, и молчит об их ночных вылазках в топь.',
    ),
    subjects: [REED_CLOAKS, 'hobb-fenwick'],
    disclosure: 'GUARDED',
    knownSince: null,
  },
  {
    id: 'ilse-saint',
    scope: npc('sister-ilse'),
    type: 'TESTIMONY',
    statement: t(
      'Saint Odran was a knight who drowned holding back the flood. His bell was sunk with him beneath the chapel, and it must never be rung.',
      'Святой Одран был рыцарем и утонул, сдерживая наводнение. Его колокол погребли вместе с ним под часовней, и звонить в него нельзя никогда.',
    ),
    subjects: ['drowned-chapel'],
    attributedTo: 'sister-ilse',
    disclosure: 'WILLING',
    knownSince: null,
  },
  {
    id: 'ilse-lights',
    scope: npc('sister-ilse'),
    type: 'TESTIMONY',
    statement: t(
      'Lights move at the Drowned Chapel at night, and boats go out to it with no lanterns lit.',
      'Ночью у Затонувшей часовни движутся огни, и к ней плавают лодки без зажжённых фонарей.',
    ),
    subjects: ['drowned-chapel', 'feature-b57d2e3a'],
    attributedTo: 'sister-ilse',
    disclosure: 'WILLING',
    knownSince: STARTS_AT - 4 * DAY,
  },
  {
    id: 'ilse-matthis',
    scope: npc('sister-ilse'),
    type: 'FACT',
    statement: t(
      'Old Matthis went to the bell tower on the third night with a lantern and a cudgel.',
      'Старый Маттис ушёл на колокольню на третью ночь с фонарём и дубинкой.',
    ),
    subjects: ['old-matthis', 'bell-tower'],
    disclosure: 'WILLING',
    knownSince: STARTS_AT - DAY,
  },
  {
    id: 'kerra-lantern',
    scope: npc('kerra-reed'),
    type: 'SECRET',
    statement: t(
      'A hooded lantern-bearer pays the Reed Cloaks in silver to carry the dead, and the living, to the stair beneath the chapel.',
      'Фонарщик в капюшоне платит Тростниковым плащам серебром, чтобы те возили мёртвых — и живых — к лестнице под часовней.',
    ),
    subjects: [LANTERN_MAN, 'drowned-chapel', REED_CLOAKS],
    disclosure: 'GUARDED',
    knownSince: STARTS_AT - 20 * DAY,
  },
  {
    id: 'kerra-stair',
    scope: npc('kerra-reed'),
    type: 'SECRET',
    statement: t(
      'The way down lies under the cracked slab before the chapel altar: press the carved bell.',
      'Путь вниз — под треснувшей плитой перед алтарём часовни: нажать на вырезанный колокол.',
    ),
    subjects: ['feature-f3c7a185', 'drowned-chapel'],
    disclosure: 'GUARDED',
    knownSince: STARTS_AT - 20 * DAY,
  },
  {
    id: 'matthis-witness',
    scope: npc('old-matthis'),
    type: 'TESTIMONY',
    statement: t(
      'The hooded one makes me ring the old bell down here, and every time it rings, the knight in the pool stirs.',
      'Тот, в капюшоне, заставляет меня звонить здесь в старый колокол, и всякий раз, как он звонит, рыцарь в омуте шевелится.',
    ),
    subjects: [LANTERN_MAN, 'feature-6e0a4bd2', KNIGHT],
    attributedTo: 'old-matthis',
    disclosure: 'WILLING',
    knownSince: STARTS_AT - DAY,
  },
  {
    id: 'lantern-purpose',
    scope: npc(LANTERN_MAN),
    type: 'SECRET',
    statement: t(
      'The sunken bell is calling the drowned knight back; risen, he will be the Ashen Circle’s champion.',
      'Утонувший колокол зовёт рыцаря обратно; восстав, он станет поборником Пепельного круга.',
    ),
    subjects: [ASHEN_CIRCLE, 'feature-6e0a4bd2', KNIGHT],
    disclosure: 'GUARDED',
    knownSince: STARTS_AT - 40 * DAY,
  },
  {
    id: 'truth-lantern-man',
    scope: { kind: 'WORLD_TRUTH' },
    type: 'SECRET',
    statement: t(
      'The hooded lantern-bearer is Brother Corvin of the Ashen Circle.',
      'Фонарщик в капюшоне — брат Корвин из Пепельного круга.',
    ),
    subjects: [LANTERN_MAN, ASHEN_CIRCLE],
    knownSince: null,
  },
  {
    id: 'truth-knight',
    scope: { kind: 'WORLD_TRUTH' },
    type: 'SECRET',
    statement: t(
      'The Drowned Knight is Saint Odran himself, risen as a wight by the ringing of the sunken bell.',
      'Утонувший рыцарь — сам святой Одран, поднятый умертвием звоном утонувшего колокола.',
    ),
    subjects: [KNIGHT, 'feature-6e0a4bd2'],
    knownSince: null,
  },
  {
    id: 'truth-matthis',
    scope: { kind: 'WORLD_TRUTH' },
    type: 'FACT',
    statement: t(
      'Old Matthis is alive, held in the flooded crypt to ring the sunken bell.',
      'Старый Маттис жив: его держат в затопленном склепе, чтобы он звонил в утонувший колокол.',
    ),
    subjects: ['old-matthis', CRYPT],
    knownSince: null,
  },
  {
    id: 'truth-two-bells',
    scope: { kind: 'WORLD_TRUTH' },
    type: 'FACT',
    statement: t(
      'The bell of Hollowmere rings of itself whenever the sunken bell is struck beneath the marsh.',
      'Колокол Холлоумира звонит сам, стоит ударить в утонувший колокол под топью.',
    ),
    subjects: ['hollowmere-bell', 'feature-6e0a4bd2'],
    knownSince: null,
  },
  {
    id: 'dm-milestones',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'Milestones: level 2 when the wagon reaches Hollowmere and the cellar breach is cleared or sealed; level 3 after the Drowned Chapel; level 4 after the Sunken Mill; level 5 when the sunken bell is silenced.',
      'Вехи: 2-й уровень, когда повозка дошла до Холлоумира и лаз в погребе очищен или заделан; 3-й — после Затонувшей часовни; 4-й — после Затопленной мельницы; 5-й — когда утонувший колокол умолк.',
    ),
    subjects: ['hollowmere'],
    knownSince: null,
  },
  {
    id: 'dm-route-willow-ford-ambush',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'The raiders want oil. They flee when half of them fall. At the end of round three they leave with a crate unless already driven off. The party can yield the crate earlier and cover its wounded. The wagon covers the remaining sixteen miles. Hobb bars the cellar for the night and offers beds before it is opened in the morning.',
      'Налётчикам нужно масло. Когда падает половина из них, остальные бегут. В конце третьего раунда они уходят с ящиком, если их ещё не прогнали. Можно отдать ящик раньше и прикрыть раненых. До деревни шестнадцать миль на повозке. Хобб на ночь запирает погреб и предлагает постели. Крышку приподнимут утром.',
    ),
    subjects: ['willow-ford'],
    knownSince: null,
  },
  {
    id: 'dm-route-cellar-rats',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'The loose salt cask at G4 can plug the breach. It takes two actions by adjacent heroes, together or on successive turns. If the party pulls back, Hobb lowers the cellar door. They can help him seal it from upstairs, losing the remaining salt. Either way resolves the cellar milestone. Once the cask plugs the breach the swarm scatters. If the last hero falls, Hobb works the hoist from the hatch. Resolve death saves for the dying. When a survivor wakes, offer the loss of the salt and the road to the chapel. If nobody survives, Hobb boards up the cellar and asks the village to ration salt.',
      'В G4 покачивается бочка с солью. Чтобы заткнуть ею лаз, нужны два действия рядом с бочкой, в один ход на двоих или за несколько ходов. Если отряд отступит, Хобб захлопнет крышку. Герои могут помочь ему заделать лаз сверху ценой оставшейся соли. В обоих случаях веха погреба достигнута. Когда бочка закрывает лаз, рой разбегается. Если упал последний герой, Хобб вытаскивает раненых воротом у люка. Разыграйте спасброски умирающих. Когда выживший очнётся, предложите пожертвовать солью и идти к часовне. Если погибли все, Хобб заколачивает погреб и просит деревню делить соль по горсти.',
    ),
    subjects: ['reeves-cellar'],
    knownSince: null,
  },
  {
    id: 'dm-route-drowned-chapel',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'The inscription on the porch marks the way below. Heroes who pull their wounded back to the boat can copy it from the landing and earn the chapel milestone. The dead stay in the nave. The dry porch or the boat in the reeds gives the party an hour before it enters the marsh. If everyone falls, resolve death saves. At low water Ilse takes a boat to the west landing. A survivor can give her the inscription and decide whether to enter the marsh or go home with the warning. If nobody lives, she ties the empty boat across the causeway and closes the crossing.',
      'Надпись на паперти указывает путь вниз. Если герои отступят с ранеными к лодке, надпись можно срисовать с мостков и получить веху часовни. Мертвецы останутся в нефе. На сухой паперти или в лодке за камышом есть час до выхода в топь. Если упали все, разыграйте спасброски от смерти. В малую воду Ильзе приходит на лодке к западным мосткам. Очнувшийся может передать ей надпись и решить, входить ли в топь или вернуться с предупреждением. Если погибли все, Ильзе перегораживает гать пустой лодкой и закрывает переправу.',
    ),
    subjects: ['drowned-chapel'],
    knownSince: null,
  },
  {
    id: 'dm-route-marsh-lights',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'The frogs stay in the reeds. The party can retreat along its pole marks as soon as it has enough hands to pull the wounded aboard. It loses daylight and returns by the long channel. If all fall in the reeds, resolve death saves. At dawn Ilse follows the pole marks. She brings back survivors by the long channel; let them choose a later approach or close the crossing. If nobody lives, she marks the last pole with a black strip. That night the village still hears the bell.',
      'Лягушки держатся камыша. Герои могут погрузить раненых в лодку и отступить по зарубкам от шеста. Длинный обратный проток стоит им остатка светлого дня. Если упали все, разыграйте спасброски от смерти. На рассвете Ильзе идёт по зарубкам. Живых она увозит длинным протоком. Они могут вернуться к мельнице позже или закрыть переправу. Если погибли все, Ильзе повязывает на последний шест чёрную ленту. Ночью в деревне снова слышат звон.',
    ),
    subjects: ['fogmarsh'],
    knownSince: null,
  },
  {
    id: 'dm-route-sunken-mill',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'Below half her hit points Kerra offers the way down and one of her two healing potions for safe passage for her crew. If the party withdraws first, the ledger can still be read from the loading hatch when the boats leave. Following this route earns the mill milestone. The loading hatch opens to the west quay. If everyone falls, resolve death saves. Kerra leaves the living tied at the hatch and takes her boats away. A survivor can rub a binding on an iron hinge, read the ledger and choose the stair or take the names to Ilse. If nobody survives, the boats take the cargo and the village gets no ledger.',
      'Когда у Керры остаётся меньше половины хитов, она предлагает путь вниз и одно из двух своих зелий лечения за свободный выход для команды. При более раннем отходе книгу можно прочесть через погрузочный люк, когда лодки уйдут. Разведанный спуск даёт веху мельницы. Погрузочный люк выходит на западную пристань. Если упали все, разыграйте спасброски от смерти. Керра оставляет живых связанными у люка и уводит лодки. Очнувшийся может перетереть путы о петлю, прочесть книгу и выбрать лестницу или отнести имена Ильзе. Если погибли все, лодки увозят груз, а в деревне так и не узнают имён из книги.',
    ),
    subjects: ['sunken-mill'],
    knownSince: null,
  },
  {
    id: 'dm-route-flooded-stair',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'Two adjacent actions at the E5 sluice release the old grate between the party and the ghouls. The party can also withdraw through the side sacristy. Its bar holds for an hour; staying costs the last smuggling boat, which the lantern-bearer cuts loose. Afterward a service door opens into the bell chamber. The sacristy is on the west side. If everyone falls before the grate drops, resolve death saves. The ghouls slip under the water at dawn. Anyone who wakes can leave through the sacristy or take the service door without the boat. If nobody comes back, Ilse locks the chapel after the next midnight bell.',
      'Два действия рядом с затвором в E5 опускают старую решётку между героями и упырями. Отступить можно через боковую ризницу. Её засов держит час. За это время Фонарщик отвязывает последнюю лодку контрабандистов. Служебная дверь из ризницы ведёт в зал колокола. Ризница с западной стороны. Если все упали до того, как опустилась решётка, разыграйте спасброски от смерти. На рассвете упыри уходят под воду. Очнувшиеся могут выйти через ризницу или пройти служебной дверью без лодки. Если никто не вернулся, после следующего полуночного звона Ильзе запирает часовню.',
    ),
    subjects: [CRYPT],
    knownSince: null,
  },
  {
    id: 'dm-route-sunken-bell',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'To silence the bell under guard, spend one adjacent action at the rope cleat G5 and another at the clapper I6. A lone survivor can do both. With the rope slack and the clapper bound, the knight sinks and the jailers run. The party can instead take the prisoners out or fight the guard. Record separately who escaped and whether the bell still rings. An action beside D3 opens the prisoners’ bolt from this side of the crypt. Escort them to A3 and out through the sacristy. Include Matthis only if he is still held. If the last hero falls, resolve death saves. The jailers keep the living. At midnight Ilse hears the bell and marks the missing names on the chapel door. End there, or let any captives offer the jailers a bargain next session.',
      'Чтобы заглушить колокол под охраной, потратьте действие у крепления каната G5 и ещё одно у языка I6. Оба может выполнить один выживший. Когда канат ослаблен, а язык связан, рыцарь погружается в воду и тюремщики бегут. Можно вывести пленников или принять бой со стражей. Запишите отдельно, кто вышел и звонит ли колокол. Действие рядом с D3 открывает засов двери пленников со стороны склепа. Доведите их до A3 и через ризницу наружу. Маттис среди них, только если он всё ещё в плену. Если упал последний герой, разыграйте спасброски от смерти. Тюремщики оставляют живых у себя. В полночь Ильзе слышит звон и мелом пишет на двери часовни имена пропавших. Здесь можно закончить или в следующую встречу дать пленным предложить тюремщикам сделку.',
    ),
    subjects: [BELL_CHAMBER],
    knownSince: null,
  },
  {
    id: 'dm-kerra-parley',
    scope: { kind: 'DM' },
    type: 'SECRET',
    statement: t(
      'Kerra Reed parleys when she falls below half her hit points: she trades the way down for her life and her people’s.',
      'Керра Рид идёт на переговоры, когда у неё остаётся меньше половины хитов: путь вниз в обмен на жизнь — свою и своих людей.',
    ),
    subjects: ['kerra-reed'],
    knownSince: null,
  },
];

export interface Clue {
  readonly id: string;
  readonly on: string;
  readonly method: 'inspect' | 'investigation' | 'perception' | 'magic';
  readonly dc?: number;
  readonly statement: Text;
  readonly subjects: readonly string[];
}

/** The ledger found at the Sunken Mill: a story object, not a catalog item. */
export const LEDGER = 'item-4f8e2c61';

export const CLUES: readonly Clue[] = [
  {
    id: 'clue-ford-tracks',
    on: 'feature-8a2f6c14',
    method: 'perception',
    dc: 10,
    statement: t(
      'Small clawed feet, and the drag of something heavy, lead off the road toward the marsh.',
      'Следы маленьких когтистых ног и борозда от чего-то тяжёлого уходят с дороги к топи.',
    ),
    subjects: ['willow-ford', 'fogmarsh'],
  },
  {
    id: 'clue-bell-rope',
    on: 'feature-1e6b3d90',
    method: 'inspect',
    statement: t(
      'The rope was cut and knotted again with reed twine in a ferryman’s hitch.',
      'Верёвку перерезали и снова связали тростниковой бечёвкой — узлом перевозчиков.',
    ),
    subjects: ['hollowmere-bell', REED_CLOAKS],
  },
  {
    id: 'clue-rope-verdigris',
    on: 'feature-1e6b3d90',
    method: 'investigation',
    dc: 12,
    statement: t(
      'The green on the knot is verdigris, as from old copper kept a long time in water.',
      'Зелень на узле — медная патина, как от старой меди, долго пролежавшей в воде.',
    ),
    subjects: ['hollowmere-bell', 'drowned-chapel'],
  },
  {
    id: 'clue-bell-echo',
    on: 'hollowmere-bell',
    method: 'magic',
    statement: t(
      'A faint necromantic echo clings to the bronze, as if a second bell rang far below.',
      'На бронзе лежит слабый некромантический отзвук, будто далеко внизу звонит второй колокол.',
    ),
    subjects: ['hollowmere-bell'],
  },
  {
    id: 'clue-cellar-tunnel',
    on: 'reeves-cellar',
    method: 'inspect',
    statement: t(
      'The hole in the floor opens on a flooded tunnel that smells of the marsh.',
      'Дыра в полу ведёт в затопленный лаз, пахнущий болотом.',
    ),
    subjects: ['reeves-cellar', 'fogmarsh'],
  },
  {
    id: 'clue-marsh-channel',
    on: 'feature-b57d2e3a',
    method: 'perception',
    dc: 12,
    statement: t(
      'Beneath the lights a narrow channel is cut through the reeds toward the chapel, poled not long ago.',
      'Под огнями в тростнике прорублена узкая протока к часовне; по ней недавно ходили на шесте.',
    ),
    subjects: ['fogmarsh', 'drowned-chapel'],
  },
  {
    id: 'clue-altar-necromancy',
    on: 'feature-0d9b5e72',
    method: 'magic',
    statement: t(
      'Necromancy lingers on the altar, strongest toward the cracked slab before it.',
      'На алтаре держится некромантия, сильнее всего — у треснувшей плиты перед ним.',
    ),
    subjects: ['drowned-chapel', 'feature-f3c7a185'],
  },
  {
    id: 'clue-slab-stair',
    on: 'feature-f3c7a185',
    method: 'investigation',
    dc: 13,
    statement: t(
      'The slab lifts when the carved bell is pressed; a stair goes down into dark water.',
      'Плита поднимается, если нажать на вырезанный колокол; вниз, в тёмную воду, ведёт лестница.',
    ),
    subjects: ['drowned-chapel', 'feature-f3c7a185'],
  },
  {
    id: 'clue-ledger',
    on: LEDGER,
    method: 'inspect',
    statement: t(
      'Payments from “the Lantern” in silver; “cargo” carried by night to “the stair under the saint”.',
      'Плата от «Фонаря» серебром; «груз» ночью доставлен к «лестнице под святым».',
    ),
    subjects: [REED_CLOAKS, LANTERN_MAN, 'drowned-chapel'],
  },
];
